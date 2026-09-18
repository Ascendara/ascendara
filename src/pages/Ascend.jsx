import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AscendSidebar from "@/components/AscendSidebar";
import SubscriptionPlanDialog from "@/components/SubscriptionPlanDialog";
import { toast } from "sonner";
import {
  User,
  Mail,
  Loader2,
  ArrowRight,
  Clock,
  RefreshCw,
  LockIcon,
  ExternalLink,
  CloudOff,
  Hammer,
  BadgeDollarSign,
} from "lucide-react";
import { lazy, Suspense } from "react";
import useAscendPage from "./ascend/useAscendPage";
import SectionLoading from "./ascend/SectionLoading";
const HomeSection = lazy(() => import("./ascend/HomeSection"));
const SearchSection = lazy(() => import("./ascend/SearchSection"));
const FriendsSection = lazy(() => import("./ascend/FriendsSection"));
const RequestsSection = lazy(() => import("./ascend/RequestsSection"));
const MessagesSection = lazy(() => import("./ascend/MessagesSection"));
const NotificationsSection = lazy(() => import("./ascend/NotificationsSection"));
const SettingsSection = lazy(() => import("./ascend/SettingsSection"));
const CloudLibrarySection = lazy(() => import("./ascend/CloudLibrarySection"));
const LeaderboardSection = lazy(() => import("./ascend/LeaderboardSection"));
const AdStatsSection = lazy(() => import("./ascend/AdStatsSection"));
const UpcomingSection = lazy(() => import("./ascend/UpcomingSection"));
const UserProfileSection = lazy(() => import("./ascend/UserProfileSection"));
const CloudBackupsSection = lazy(() => import("./ascend/CloudBackupsSection"));
const PremiumSection = lazy(() => import("./ascend/PremiumSection"));
const AuthSection = lazy(() => import("./ascend/AuthSection"));

const Ascend = () => {
  const {
    checkingVersion,
    t,
    isOutdated,
    authLoading,
    user,
    reloadUser,
    handleResendVerification,
    isResendingEmail,
    showDisplayNamePrompt,
    googleDisplayName,
    setGoogleDisplayName,
    isSubmitting,
    handleGoogleDisplayNameSubmit,
    ascendAccess,
    deletedAccountWarning,
    handleSubscribe,
    handleLogout,
    showPlanDialog,
    setShowPlanDialog,
    availablePlans,
    handlePlanSelection,
    userData,
    activeSection,
    userStatus,
    setActiveSection,
    friends,
    incomingRequests,
    localStats,
    formatPlaytime,
    loadingLocalStats,
    recentGames,
    gameImages,
    loadingProfileStats,
    profileStats,
    handleSyncProfile,
    isSyncingProfile,
    handleSearch,
    searchQuery,
    setSearchQuery,
    isSearching,
    searchResults,
    handleViewProfile,
    getRelationshipStatus,
    handleSendRequest,
    loadingFriends,
    handleStartConversation,
    handleRemoveFriend,
    outgoingRequests,
    loadingRequests,
    handleAcceptRequest,
    handleDenyRequest,
    loadingConversations,
    conversations,
    handleSelectConversation,
    selectedConversation,
    setSelectedConversation,
    loadingMessages,
    messages,
    messagesEndRef,
    handleSendMessage,
    messageInput,
    setMessageInput,
    sendingMessage,
    loadingNotifications,
    notifications,
    isEditingProfile,
    handleStartEditProfile,
    editPhotoURL,
    editDisplayName,
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
    showSubscriptionSuccess,
    setShowSubscriptionSuccess,
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
    getFilteredLibraryGames,
    cloudLibrary,
    handleRestoreFromCloud,
    isRestoringFromCloud,
    isSyncingLibrary,
    handleSyncLibrary,
    librarySearchQuery,
    setLibrarySearchQuery,
    librarySortBy,
    setLibrarySortBy,
    loadingCloudLibrary,
    expandedGame,
    handleExpandGame,
    cloudLibraryImages,
    isGameInstalledLocally,
    loadingGameAchievements,
    gameAchievements,
    showDeleteConfirm,
    setShowDeleteConfirm,
    handleDeleteCloudGame,
    deletingGame,
    leaderboardData,
    loadingLeaderboard,
    loadLeaderboard,
    upcomingChangelog,
    loadingUpcoming,
    loadUpcomingChangelog,
    handleBackFromProfile,
    loadingProfile,
    profileError,
    viewingProfile,
    reportDialogOpen,
    setReportDialogOpen,
    handleSubmitUserReport,
    reportUserReason,
    setReportUserReason,
    reportUserDetails,
    setReportUserDetails,
    isReportingUser,
    loadBackups,
    backupFilterGame,
    loadingBackups,
    setBackupFilterGame,
    backups,
    deletingBackup,
    handleDeleteBackup,
    setUserStatus,
    isLogin,
    accountExistsError,
    setAccountExistsError,
    setIsLogin,
    setDeletedAccountWarning,
    linkWithPC,
    setLinkWithPC,
    startFreeTrial,
    setStartFreeTrial,
    handleGoogleSignIn,
    isGoogleLoading,
    handleSubmit,
    formData,
    handleInputChange,
    showPassword,
    setShowPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    toggleMode,
    showEmailConfirmDialog,
    setShowEmailConfirmDialog,
    pendingSignupData,
    setPendingSignupData,
    handleConfirmSignup,
  } = useAscendPage();
  // Block access if app is outdated
  if (checkingVersion) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("ascend.checkingVersion") || "Checking version..."}
          </p>
        </motion.div>
      </div>
    );
  }

  if (isOutdated) {
    return (
      <div className="container mx-auto flex min-h-[80vh] max-w-md items-center px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full space-y-6"
        >
          <div className="space-y-2 text-center">
            <div className="bg-destructive/10 mx-auto flex h-16 w-16 items-center justify-center rounded-full">
              <CloudOff className="text-destructive h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold">
              {t("ascend.updateRequired.title") || "Update Required"}
            </h1>
            <p className="text-muted-foreground">
              {t("ascend.updateRequired.description") ||
                "Please update Ascendara to the latest version to access Ascend features."}
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t("ascend.updateRequired.info") ||
                "Ascend requires the latest version of Ascendara to ensure security and compatibility."}
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => window.electron?.openURL("https://ascendara.app/")}
              className="h-11 w-full text-secondary"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("ascend.updateRequired.download") || "Download Latest Version"}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Check if Firebase credentials are available
  const hasFirebaseCredentials = !!(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID
  );

  if (!hasFirebaseCredentials) {
    return (
      <div className="container mx-auto flex min-h-[80vh] max-w-2xl items-center px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full space-y-6 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-background p-8 text-center"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
            <Hammer className="h-8 w-8 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">{t("account.developmentMode.title")}</h2>
            <p className="text-muted-foreground">
              {t("account.developmentMode.description")}
            </p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/50 p-4 text-left">
            <p className="text-sm font-medium text-foreground">
              {t("account.developmentMode.productionOnly")}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>• Account creation and authentication</li>
              <li>• Friends and messaging</li>
              <li>• Cloud library sync</li>
              <li>• Leaderboards and achievements</li>
              <li>• Community features</li>
            </ul>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              window.electron.openExternal(
                "https://github.com/Ascendara/ascendara#-configure-firebase"
              )
            }
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            {t("account.developmentMode.learnMore")}
          </Button>
        </motion.div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">
            {t("account.loading") || "Loading..."}
          </p>
        </motion.div>
      </div>
    );
  }

  // Email verification required screen (only for email/password users)
  if (user && !user.emailVerified && user.providerData?.[0]?.providerId === "password") {
    return (
      <div className="container mx-auto flex min-h-[80vh] max-w-md items-center px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full space-y-6"
        >
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">{t("account.verification.title")}</h1>
            <p className="text-muted-foreground">{t("account.verification.subtitle")}</p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t("account.verification.sentTo")}
            </p>
            <p className="mt-1 font-medium">{user.email}</p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={async () => {
                const result = await reloadUser();
                if (result.success && result.user?.emailVerified) {
                  toast.success(t("account.verification.verified"));
                } else {
                  toast.error(t("account.verification.notYet"));
                }
              }}
              className="h-11 w-full text-secondary"
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              {t("account.verification.checkNow")}
            </Button>

            <Button
              onClick={handleResendVerification}
              variant="outline"
              className="h-11 w-full"
              disabled={isResendingEmail}
            >
              {isResendingEmail ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              {t("account.verification.resend")}
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            {t("account.verification.checking")}
          </p>
        </motion.div>
      </div>
    );
  }

  // If user is logged in, show social hub
  if (user) {
    // Display name prompt for new Google users - show FIRST before any access checks
    if (showDisplayNamePrompt) {
      return (
        <div className="container mx-auto flex min-h-[80vh] max-w-md items-center px-6 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full space-y-6"
          >
            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-bold">{t("account.almostThere")}</h1>
              <p className="text-muted-foreground">{t("account.chooseDisplayName")}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="googleDisplayName">{t("account.form.displayName")}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="googleDisplayName"
                    type="text"
                    placeholder={t("account.form.displayNamePlaceholder")}
                    value={googleDisplayName}
                    onChange={e => setGoogleDisplayName(e.target.value)}
                    className="h-11 pl-10"
                    disabled={isSubmitting}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("account.displayNameHint")}
                </p>
              </div>

              <Button
                onClick={handleGoogleDisplayNameSubmit}
                className="h-11 w-full text-secondary"
                disabled={isSubmitting || googleDisplayName.trim().length < 4}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                {t("account.form.continue")}
              </Button>
            </div>
          </motion.div>
        </div>
      );
    }

    // Show access denied if trial expired/blocked and not subscribed
    if (ascendAccess.verified && !ascendAccess.hasAccess) {
      const isTrialBlocked = ascendAccess.trialBlocked;
      const isNoTrial = ascendAccess.noTrial;

      // Special screen for users blocked from free trial
      if (isNoTrial) {
        return (
          <>
            <div className="fixed inset-0 flex items-center justify-center bg-background/95 backdrop-blur-sm">
              <div className="mx-auto max-w-md space-y-6 p-8 text-center">
                <div className="bg-destructive/10 mx-auto flex h-20 w-20 items-center justify-center rounded-full">
                  <LockIcon className="text-destructive h-10 w-10" />
                </div>
                <h1 className="text-2xl font-bold">{t("ascend.access.noTrialTitle")}</h1>
                <p className="text-muted-foreground">
                  {t("ascend.access.noTrialMessage")}
                </p>
                {ascendAccess.noTrialReason && (
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("ascend.access.reason")}:
                    </p>
                    <p className="mt-1 text-sm">{ascendAccess.noTrialReason}</p>
                  </div>
                )}
                {!deletedAccountWarning && (
                  <Button onClick={handleSubscribe} className="w-full text-secondary">
                    <BadgeDollarSign className="mr-2 h-4 w-4" />
                    {t("ascend.settings.subscribe")}
                  </Button>
                )}
                {deletedAccountWarning && (
                  <div className="bg-destructive/10 border-destructive/30 text-destructive rounded-lg border p-4 text-sm">
                    {t("account.errors.cannotSubscribeDeleted") ||
                      "Cannot subscribe - account deleted"}
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {t("account.signOut")}
                </button>
              </div>
            </div>

            {/* Subscription Plan Selection Dialog */}
            <SubscriptionPlanDialog
              open={showPlanDialog}
              onOpenChange={setShowPlanDialog}
              availablePlans={availablePlans}
              onPlanSelection={handlePlanSelection}
              t={t}
            />
          </>
        );
      }

      return (
        <>
          <div className="fixed inset-0 flex items-center justify-center bg-background/95 backdrop-blur-sm">
            <div className="mx-auto max-w-md space-y-6 p-8 text-center">
              <div className="bg-destructive/10 mx-auto flex h-20 w-20 items-center justify-center rounded-full">
                <Clock className="text-destructive h-10 w-10" />
              </div>
              <h1 className="text-2xl font-bold">
                {isTrialBlocked
                  ? t("ascend.access.trialBlocked")
                  : t("ascend.access.subscriptionExpired")}
              </h1>
              <p className="text-muted-foreground">
                {isTrialBlocked
                  ? t("ascend.access.trialBlockedMessage")
                  : userData?.ascendSubscription?.lifetime
                    ? t("ascend.access.subscriptionExpiredMessage")
                    : userData?.ascendSubscription?.expiresAt
                      ? t("ascend.access.subscriptionExpiredOn", {
                          date: new Date(
                            userData.ascendSubscription.expiresAt.toDate()
                          ).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          }),
                        })
                      : t("ascend.access.subscriptionExpiredMessage")}
              </p>
              {!deletedAccountWarning && (
                <div className="space-y-3">
                  <Button onClick={handleSubscribe} className="w-full text-secondary">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t("ascend.access.renewSubscription")}
                  </Button>
                </div>
              )}
              {deletedAccountWarning && (
                <div className="bg-destructive/10 border-destructive/30 text-destructive rounded-lg border p-4 text-sm">
                  {t("account.errors.cannotSubscribeDeleted") ||
                    "Cannot subscribe - account deleted"}
                </div>
              )}
              <button
                onClick={handleLogout}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t("account.signOut")}
              </button>
            </div>
          </div>

          {/* Subscription Plan Selection Dialog */}
          <SubscriptionPlanDialog
            open={showPlanDialog}
            onOpenChange={setShowPlanDialog}
            availablePlans={availablePlans}
            onPlanSelection={handlePlanSelection}
            t={t}
          />
        </>
      );
    }

    // Format playtime for display
    const formatPlaytimeDetailed = seconds => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (hours === 0) return `${minutes}m`;
      return `${hours}h ${minutes}m`;
    };

    // Render content based on active section
    const renderContent = () => {
      switch (activeSection) {
        case "home":
          return (
            <HomeSection
              user={user}
              userStatus={userStatus}
              t={t}
              setActiveSection={setActiveSection}
              friends={friends}
              incomingRequests={incomingRequests}
              localStats={localStats}
              formatPlaytime={formatPlaytime}
              loadingLocalStats={loadingLocalStats}
              recentGames={recentGames}
              gameImages={gameImages}
              formatPlaytimeDetailed={formatPlaytimeDetailed}
              loadingProfileStats={loadingProfileStats}
              profileStats={profileStats}
              handleSyncProfile={handleSyncProfile}
              isSyncingProfile={isSyncingProfile}
            />
          );

        case "search":
          return (
            <SearchSection
              t={t}
              handleSearch={handleSearch}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              isSearching={isSearching}
              searchResults={searchResults}
              handleViewProfile={handleViewProfile}
              getRelationshipStatus={getRelationshipStatus}
              handleSendRequest={handleSendRequest}
            />
          );

        case "friends":
          return (
            <FriendsSection
              friends={friends}
              t={t}
              setActiveSection={setActiveSection}
              loadingFriends={loadingFriends}
              handleViewProfile={handleViewProfile}
              handleStartConversation={handleStartConversation}
              handleRemoveFriend={handleRemoveFriend}
            />
          );

        case "requests":
          return (
            <RequestsSection
              t={t}
              setActiveSection={setActiveSection}
              incomingRequests={incomingRequests}
              outgoingRequests={outgoingRequests}
              loadingRequests={loadingRequests}
              handleAcceptRequest={handleAcceptRequest}
              handleDenyRequest={handleDenyRequest}
            />
          );

        case "messages":
          return (
            <MessagesSection
              t={t}
              loadingConversations={loadingConversations}
              conversations={conversations}
              handleSelectConversation={handleSelectConversation}
              selectedConversation={selectedConversation}
              user={user}
              setActiveSection={setActiveSection}
              setSelectedConversation={setSelectedConversation}
              handleViewProfile={handleViewProfile}
              loadingMessages={loadingMessages}
              messages={messages}
              messagesEndRef={messagesEndRef}
              handleSendMessage={handleSendMessage}
              messageInput={messageInput}
              setMessageInput={setMessageInput}
              sendingMessage={sendingMessage}
            />
          );

        case "notifications":
          return (
            <NotificationsSection
              t={t}
              loadingNotifications={loadingNotifications}
              notifications={notifications}
            />
          );

        case "settings":
          return (
            <SettingsSection
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
              ascendAccess={ascendAccess}
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
              updateData={updateData}
              isDev={isDev}
              devSubscriptionState={devSubscriptionState}
              setDevSubscriptionState={setDevSubscriptionState}
              handleViewInvoices={handleViewInvoices}
              handleManageSubscription={handleManageSubscription}
              deletedAccountWarning={deletedAccountWarning}
              handleSubscribe={handleSubscribe}
              showSubscriptionSuccess={showSubscriptionSuccess}
              setShowSubscriptionSuccess={setShowSubscriptionSuccess}
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
          );

        case "cloudlibrary":
          return (
            <CloudLibrarySection
              getFilteredLibraryGames={getFilteredLibraryGames}
              cloudLibrary={cloudLibrary}
              t={t}
              handleRestoreFromCloud={handleRestoreFromCloud}
              isRestoringFromCloud={isRestoringFromCloud}
              isSyncingLibrary={isSyncingLibrary}
              handleSyncLibrary={handleSyncLibrary}
              formatPlaytimeDetailed={formatPlaytimeDetailed}
              librarySearchQuery={librarySearchQuery}
              setLibrarySearchQuery={setLibrarySearchQuery}
              librarySortBy={librarySortBy}
              setLibrarySortBy={setLibrarySortBy}
              loadingCloudLibrary={loadingCloudLibrary}
              expandedGame={expandedGame}
              handleExpandGame={handleExpandGame}
              cloudLibraryImages={cloudLibraryImages}
              isGameInstalledLocally={isGameInstalledLocally}
              loadingGameAchievements={loadingGameAchievements}
              gameAchievements={gameAchievements}
              showDeleteConfirm={showDeleteConfirm}
              setShowDeleteConfirm={setShowDeleteConfirm}
              handleDeleteCloudGame={handleDeleteCloudGame}
              deletingGame={deletingGame}
            />
          );

        case "leaderboard":
          // Load leaderboard data when section is accessed
          return (
            <LeaderboardSection
              leaderboardData={leaderboardData}
              loadingLeaderboard={loadingLeaderboard}
              loadLeaderboard={loadLeaderboard}
              t={t}
              handleViewProfile={handleViewProfile}
              setActiveSection={setActiveSection}
            />
          );

        case "adstats":
          return <AdStatsSection user={user} />;

        case "upcoming":
          // Load upcoming changelog when section is accessed
          return (
            <UpcomingSection
              upcomingChangelog={upcomingChangelog}
              loadingUpcoming={loadingUpcoming}
              loadUpcomingChangelog={loadUpcomingChangelog}
              t={t}
            />
          );

        case "userProfile":
          return (
            <UserProfileSection
              handleBackFromProfile={handleBackFromProfile}
              t={t}
              loadingProfile={loadingProfile}
              profileError={profileError}
              viewingProfile={viewingProfile}
              getRelationshipStatus={getRelationshipStatus}
              handleStartConversation={handleStartConversation}
              handleSendRequest={handleSendRequest}
              reportDialogOpen={reportDialogOpen}
              setReportDialogOpen={setReportDialogOpen}
              handleSubmitUserReport={handleSubmitUserReport}
              reportUserReason={reportUserReason}
              setReportUserReason={setReportUserReason}
              reportUserDetails={reportUserDetails}
              setReportUserDetails={setReportUserDetails}
              isReportingUser={isReportingUser}
            />
          );

        case "cloudbackups":
          return (
            <CloudBackupsSection
              t={t}
              ascendAccess={ascendAccess}
              setActiveSection={setActiveSection}
              loadBackups={loadBackups}
              backupFilterGame={backupFilterGame}
              loadingBackups={loadingBackups}
              setBackupFilterGame={setBackupFilterGame}
              backups={backups}
              deletingBackup={deletingBackup}
              handleDeleteBackup={handleDeleteBackup}
            />
          );

        case "premium":
          return <PremiumSection t={t} />;

        default:
          return null;
      }
    };

    return (
      <>
        <div className="fixed inset-0 top-[60px] flex">
          {/* Sidebar */}
          <AscendSidebar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            user={user}
            userData={userData}
            onStatusChange={setUserStatus}
            ascendAccess={ascendAccess}
            onSubscribe={handleSubscribe}
          />

          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-6">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="mx-auto max-w-3xl"
            >
              {<Suspense fallback={<SectionLoading />}>{renderContent()}</Suspense>}
            </motion.div>
          </div>
        </div>

        {/* Subscription Plan Selection Dialog */}
        <SubscriptionPlanDialog
          open={showPlanDialog}
          onOpenChange={setShowPlanDialog}
          availablePlans={availablePlans}
          onPlanSelection={handlePlanSelection}
          t={t}
        />
      </>
    );
  }

  // Sign up / Login form - open two-column layout
  return (
    <Suspense fallback={<SectionLoading />}>
      <AuthSection
        isLogin={isLogin}
        t={t}
        accountExistsError={accountExistsError}
        setAccountExistsError={setAccountExistsError}
        setIsLogin={setIsLogin}
        deletedAccountWarning={deletedAccountWarning}
        setDeletedAccountWarning={setDeletedAccountWarning}
        linkWithPC={linkWithPC}
        setLinkWithPC={setLinkWithPC}
        isSubmitting={isSubmitting}
        startFreeTrial={startFreeTrial}
        setStartFreeTrial={setStartFreeTrial}
        handleGoogleSignIn={handleGoogleSignIn}
        isGoogleLoading={isGoogleLoading}
        handleSubmit={handleSubmit}
        formData={formData}
        handleInputChange={handleInputChange}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        showConfirmPassword={showConfirmPassword}
        setShowConfirmPassword={setShowConfirmPassword}
        toggleMode={toggleMode}
        showEmailConfirmDialog={showEmailConfirmDialog}
        setShowEmailConfirmDialog={setShowEmailConfirmDialog}
        pendingSignupData={pendingSignupData}
        setPendingSignupData={setPendingSignupData}
        handleConfirmSignup={handleConfirmSignup}
      />
    </Suspense>
  );
};

export default Ascend;
