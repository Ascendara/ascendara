import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { useNavigate } from "react-router-dom";
import { getUserAuthHeaders, userAuthenticatedFetch } from "@/utils/authHelper";
import { retroBackupPlatform, restoreRetroCloudBackup } from "@/services/retroService";
import { checkForUpdates } from "@/services/updateCheckingService";
import {
  calculateLevelFromXP,
  getLevelConstants,
} from "@/services/levelCalculationService";
import { validateInput } from "@/services/profanityFilterService";
import { toast } from "sonner";
import {
  searchUsers,
  sendFriendRequest,
  getIncomingRequests,
  getOutgoingRequests,
  acceptFriendRequest,
  denyFriendRequest,
  getFriendsList,
  removeFriend,
  getUserStatus,
  verifyAscendAccess,
  getOrCreateConversation,
  sendMessage,
  getConversations,
  markMessagesAsRead,
  syncProfileToAscend,
  getProfileStats,
  recomputeProfileStats,
  checkHardwareIdAccount,
  checkDeletedAccount,
  deleteNewAccount,
  registerHardwareId,
  syncCloudLibrary,
  getCloudLibrary,
  syncGameAchievements,
  getGameAchievements,
  deleteCloudGame,
  getUserPublicProfile,
  getNotifications,
  uploadBackup,
  listBackups,
  getBackupDownloadUrl,
  deleteBackup,
  subscribeToMessages,
  subscribeToConversations,
  subscribeToFriendsList,
  subscribeToIncomingRequests,
  subscribeToOutgoingRequests,
  cleanupMessageListeners,
} from "@/services/firebaseService";

export default function useAscendPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { t } = useTranslation();
  const {
    user,
    userData,
    loading: authLoading,
    register,
    login,
    logout,
    googleSignIn,
    updateProfile,
    updateData,
    resendVerificationEmail,
    reloadUser,
    removeAccount,
    error,
    clearError,
  } = useAuth();

  const [isLogin, setIsLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [linkWithPC, setLinkWithPC] = useState(false);
  const [startFreeTrial, setStartFreeTrial] = useState(false);
  const [showDisplayNamePrompt, setShowDisplayNamePrompt] = useState(false);
  const [googleDisplayName, setGoogleDisplayName] = useState("");
  const [activeSection, setActiveSection] = useState("home");
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [accountExistsError, setAccountExistsError] = useState(null); // { email: string | null }
  const [deletedAccountWarning, setDeletedAccountWarning] = useState(false);
  const [showEmailConfirmDialog, setShowEmailConfirmDialog] = useState(false);
  const [pendingSignupData, setPendingSignupData] = useState(null);

  // Friend system state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPhotoURL, setEditPhotoURL] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editDiscord, setEditDiscord] = useState("");
  const [editEpicId, setEditEpicId] = useState("");
  const [editGithub, setEditGithub] = useState("");
  const [editSteam, setEditSteam] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Account deletion state
  const [deleteHoldProgress, setDeleteHoldProgress] = useState(0);
  const [isHoldingDelete, setIsHoldingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  // Subscription plan selection state
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [availablePlans, setAvailablePlans] = useState([]);

  // User status state
  const [userStatus, setUserStatus] = useState("online");

  // Ascend access state (server-verified)
  const [ascendAccess, setAscendAccess] = useState({
    hasAccess: true,
    daysRemaining: 7,
    isSubscribed: false,
    isVerified: false,
    verified: false,
    noTrial: false,
    noTrialReason: null,
  });
  const [verifyingAccess, setVerifyingAccess] = useState(true);
  const [showSubscriptionSuccess, setShowSubscriptionSuccess] = useState(false);
  // Subscription tier info from API (more reliable than Firestore data)
  const [subscriptionTierInfo, setSubscriptionTierInfo] = useState(null);

  // Developer mode state
  const [isDev, setIsDev] = useState(false);
  const [devSubscriptionState, setDevSubscriptionState] = useState("normal"); // normal, trial, verified, subscribed

  // Messaging state
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = React.useRef(null);

  // Profile sync state
  const [profileStats, setProfileStats] = useState(null);
  const [isSyncingProfile, setIsSyncingProfile] = useState(false);
  const [loadingProfileStats, setLoadingProfileStats] = useState(true);

  // Local profile stats for leveling card
  const [localStats, setLocalStats] = useState({
    level: 1,
    xp: 0,
    currentXP: 0,
    nextLevelXp: 100,
    totalPlaytime: 0,
    gamesPlayed: 0,
    totalGames: 0,
  });
  const [loadingLocalStats, setLoadingLocalStats] = useState(true);
  const [recentGames, setRecentGames] = useState([]);
  const [gameImages, setGameImages] = useState({});

  // Cloud Library state
  const [cloudLibrary, setCloudLibrary] = useState(null);
  const [loadingCloudLibrary, setLoadingCloudLibrary] = useState(true);
  const [isSyncingLibrary, setIsSyncingLibrary] = useState(false);
  const [isRestoringFromCloud, setIsRestoringFromCloud] = useState(false);
  const [localGames, setLocalGames] = useState([]);
  const [cloudLibraryImages, setCloudLibraryImages] = useState({});
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [librarySortBy, setLibrarySortBy] = useState("name"); // name, playtime, recent
  const [expandedGame, setExpandedGame] = useState(null); // Game name for expanded view
  const [gameAchievements, setGameAchievements] = useState(null); // Full achievements for expanded game
  const [loadingGameAchievements, setLoadingGameAchievements] = useState(false);
  const [deletingGame, setDeletingGame] = useState(null); // Game being deleted
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null); // Game name for delete confirmation

  // User profile viewing state
  const [viewingProfile, setViewingProfile] = useState(null); // User profile data being viewed
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileReturnSection, setProfileReturnSection] = useState("search"); // Where to return after viewing profile

  // Report user state
  const [isReportingUser, setIsReportingUser] = useState(false);
  const [reportUserReason, setReportUserReason] = useState("");
  const [reportUserDetails, setReportUserDetails] = useState("");
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [profileError, setProfileError] = useState(null);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Cloud Backups state
  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [uploadingBackup, setUploadingBackup] = useState(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState(null);
  const [backupGameName, setBackupGameName] = useState("");
  const [backupName, setBackupName] = useState("");
  const [backupFilterGame, setBackupFilterGame] = useState("");
  const [deletingBackup, setDeletingBackup] = useState(null);
  const [restoringBackup, setRestoringBackup] = useState(null);

  // Version check state
  const [isOutdated, setIsOutdated] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(true);

  // Check if in development mode
  useEffect(() => {
    const checkDevMode = async () => {
      try {
        const isDevMode = await window.electron.isDev();
        setIsDev(isDevMode);
      } catch (error) {
        console.error("Error checking dev mode:", error);
        setIsDev(false);
      }
    };
    checkDevMode();
  }, []);

  // Leaderboard state
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  // Upcoming update state
  const [upcomingChangelog, setUpcomingChangelog] = useState(null);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);

  // Webapp connection state
  const [webappConnectionCode, setWebappConnectionCode] = useState(null);
  const [webappQRCode, setWebappQRCode] = useState(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [webappCodeExpiry, setWebappCodeExpiry] = useState(300);
  const [webappCodeCopied, setWebappCodeCopied] = useState(false);
  const [webappCodeTimer, setWebappCodeTimer] = useState(null);
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [disconnectingDevice, setDisconnectingDevice] = useState(null);

  // Check if app is on latest version
  useEffect(() => {
    let apiRequiresUpdate = false;
    const requireUpdate = () => {
      apiRequiresUpdate = true;
      setIsOutdated(true);
    };
    window.addEventListener("ascendara:update-required", requireUpdate);
    const checkVersion = async () => {
      try {
        const isLatest = await checkForUpdates();
        setIsOutdated(apiRequiresUpdate || !isLatest);
      } catch (error) {
        console.error("Error checking version:", error);
        setIsOutdated(apiRequiresUpdate);
      }
      setCheckingVersion(false);
    };
    checkVersion();
    return () => window.removeEventListener("ascendara:update-required", requireUpdate);
  }, []);

  // Handle account pending deletion error
  useEffect(() => {
    if (error === "ACCOUNT_PENDING_DELETION") {
      toast.error(
        t("account.deletion.pendingWarning") ||
          "Your account has a pending deletion request. Join our Discord to restore your account if this was a mistake.",
        { duration: 10000 }
      );
      clearError();
    }
  }, [error, clearError, t]);

  // Verify Ascend access and load data when user is logged in
  useEffect(() => {
    if (user?.uid && !showDisplayNamePrompt) {
      verifyAccess();
      loadFriendsData();
      loadRequestsData();
      // Note: User status is loaded by AscendSidebar and synced via onStatusChange prop
      loadProfileStats();
      loadLocalStats();
      loadCloudLibrary();
      loadNotifications();
    }
  }, [user?.uid, showDisplayNamePrompt]);

  // Re-run cloud-first stats merge once Ascend access is verified. The first
  // loadLocalStats call (above) runs before verifyAccess resolves and would
  // therefore fall back to local-only stats — this ensures the dashboard
  // promptly upgrades to cloud-merged numbers as soon as access is confirmed.
  useEffect(() => {
    if (!user?.uid) return;
    if (
      ascendAccess?.isSubscribed ||
      ascendAccess?.isVerified ||
      ascendAccess?.hasAccess
    ) {
      loadLocalStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.uid,
    ascendAccess?.isSubscribed,
    ascendAccess?.isVerified,
    ascendAccess?.hasAccess,
  ]);

  // Set up real-time listener for friends list
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = subscribeToFriendsList(friends => {
      setFriends(friends);
      setLoadingFriends(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  // Set up real-time listener for incoming friend requests
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = subscribeToIncomingRequests(requests => {
      setIncomingRequests(requests);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  // Set up real-time listener for outgoing friend requests
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = subscribeToOutgoingRequests(requests => {
      setOutgoingRequests(requests);
      setLoadingRequests(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  // Set up real-time listener for conversations
  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribe = subscribeToConversations(conversations => {
      setConversations(conversations);
      setLoadingConversations(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  // Set up real-time listener for messages in active conversation
  useEffect(() => {
    if (!selectedConversation?.id) return;

    let prevMessageCount = 0;

    const unsubscribe = subscribeToMessages(selectedConversation.id, newMessages => {
      setMessages(newMessages);
      setLoadingMessages(false);

      // Show toast notification for new incoming messages (not from current user)
      if (newMessages.length > prevMessageCount && prevMessageCount > 0) {
        const latestMessage = newMessages[newMessages.length - 1];
        if (!latestMessage.isOwn && selectedConversation) {
          toast.info(
            `${selectedConversation.otherUser.displayName}: ${latestMessage.text.substring(0, 50)}${latestMessage.text.length > 50 ? "..." : ""}`,
            {
              duration: 3000,
            }
          );
        }
      }
      prevMessageCount = newMessages.length;
    });

    return () => {
      unsubscribe();
    };
  }, [selectedConversation?.id]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      // Use instant scroll when loading messages, smooth scroll for new messages
      const behavior = loadingMessages ? "instant" : "smooth";
      const viewport = messagesEndRef.current.closest("[data-message-scroll]");
      viewport?.scrollTo({ top: viewport.scrollHeight, behavior });
    }
  }, [messages, loadingMessages]);

  // Cleanup all message listeners on unmount
  useEffect(() => {
    return () => {
      cleanupMessageListeners();
    };
  }, []);

  // Load backups when cloudbackups section is accessed
  useEffect(() => {
    if (
      activeSection === "cloudbackups" &&
      user?.uid &&
      (ascendAccess.isSubscribed || ascendAccess.isVerified)
    ) {
      loadBackups();
    }
  }, [activeSection, user?.uid, ascendAccess.isSubscribed, ascendAccess.isVerified]);

  // Calculate profile statistics based on games data (same logic as Profile.jsx)
  const calculateProfileStats = (games, customGames) => {
    const allGames = [...(games || []), ...(customGames || [])];
    const { XP_RULES } = getLevelConstants();

    let totalXP = 0;
    let totalPlaytime = 0;
    let gamesPlayedCount = 0;

    allGames.forEach(game => {
      const playtimeSeconds = typeof game?.playTime === "number" ? game.playTime : 0;
      const playtimeHours = playtimeSeconds / 3600;
      const launchCount = typeof game?.launchCount === "number" ? game.launchCount : 0;
      const isCompleted = !!game?.completed;
      const hasEngagement = playtimeSeconds > 0 || launchCount > 0 || isCompleted;

      if (playtimeSeconds > 0) {
        gamesPlayedCount += 1;
      }

      totalPlaytime += playtimeSeconds;

      if (!hasEngagement) {
        return;
      }

      let gameXP = XP_RULES.basePerGame;
      gameXP += Math.floor(playtimeHours * XP_RULES.perHourPlayed);
      const launchBonus = Math.min(
        launchCount * XP_RULES.perLaunch,
        XP_RULES.launchBonusCap
      );
      gameXP += launchBonus;

      if (isCompleted) {
        gameXP += XP_RULES.completedBonus;
      }

      totalXP += gameXP;
    });

    const totalPlaytimeHours = totalPlaytime / 3600;
    for (const milestone of XP_RULES.playtimeMilestones) {
      if (totalPlaytimeHours >= milestone.hours) {
        totalXP += milestone.bonus;
      }
    }

    const levelData = calculateLevelFromXP(totalXP);

    return {
      totalPlaytime,
      gamesPlayed: allGames.filter(game => game.playTime > 0).length,
      totalGames: allGames.length,
      level: levelData.level,
      xp: levelData.xp,
      currentXP: levelData.currentXP,
      nextLevelXp: levelData.nextLevelXp,
      allGames,
    };
  };

  // Load local stats from Electron — and, for Ascend members, merge with the
  // cloud library so the dashboard reflects the user's full "gaming identity"
  // across devices, not just the games installed on this machine.
  //
  // Merge rules (per game, keyed by lowercased name):
  //   - playTime / launchCount: Math.max(local, cloud) — cloud is the floor
  //   - completed / favorite:   OR-merge
  //   - games not installed locally are still counted toward XP/level
  // Non-premium users get the original local-only behavior.
  const loadLocalStats = async () => {
    setLoadingLocalStats(true);
    try {
      const games = (await window.electron?.getGames?.()) || [];
      const customGames = (await window.electron?.getCustomGames?.()) || [];

      const hasCloudAccess =
        ascendAccess?.isSubscribed || ascendAccess?.isVerified || ascendAccess?.hasAccess;

      let mergedRegular = games;
      let mergedCustom = customGames;
      let cloudFloorPlaytime = 0;

      if (hasCloudAccess && user?.uid) {
        try {
          const cloudResult = await getCloudLibrary();
          const cloudGames = cloudResult?.data?.games || [];
          cloudFloorPlaytime = cloudResult?.data?.totalPlaytime || 0;

          if (cloudGames.length > 0) {
            const localKey = g => (g.game || g.name || "").toLowerCase();
            const cloudByName = new Map(
              cloudGames.map(cg => [(cg.name || "").toLowerCase(), cg])
            );

            const mergeWithCloud = (game, isCustom) => {
              const cg = cloudByName.get(localKey(game));
              if (!cg) return game;
              cloudByName.delete(localKey(game));
              return {
                ...game,
                playTime: Math.max(game.playTime || 0, cg.playTime || 0),
                launchCount: Math.max(game.launchCount || 0, cg.launchCount || 0),
                completed: game.completed || cg.completed || false,
                favorite: game.favorite || cg.favorite || false,
              };
            };

            mergedRegular = games.map(g => mergeWithCloud(g, false));
            mergedCustom = customGames.map(g => mergeWithCloud(g, true));

            // Cloud-only games (not installed on this machine) — synthesize
            // minimal entries so XP/level/totalPlaytime include them.
            const cloudOnly = Array.from(cloudByName.values()).map(cg => ({
              game: cg.name,
              name: cg.name,
              playTime: cg.playTime || 0,
              launchCount: cg.launchCount || 0,
              completed: cg.completed || false,
              favorite: cg.favorite || false,
              isCustom: !!cg.isCustom,
              cloudOnly: true,
              gameID: cg.gameID || null,
            }));

            mergedRegular = [...mergedRegular, ...cloudOnly.filter(g => !g.isCustom)];
            mergedCustom = [...mergedCustom, ...cloudOnly.filter(g => g.isCustom)];
          }
        } catch (e) {
          console.warn(
            "[Ascend] Cloud-first stats merge failed, falling back to local:",
            e?.message || e
          );
        }
      }

      // Local calc is kept only as an offline fallback. When the user has
      // cloud access, the authoritative level / XP / totals come from the
      // server at api.ascendara.app via `recomputeProfileStats` — the client
      // never derives these numbers when online.
      const localFallback = calculateProfileStats(mergedRegular, mergedCustom);

      // Level/XP must never decrease (e.g. after uninstalling a game or a
      // stale/lower cloud snapshot). Always take the higher of the
      // freshly-computed local XP vs. the last persisted local value.
      let persistedLocalStats = null;
      try {
        persistedLocalStats =
          (await window.electron?.getTimestampValue?.("profileStats")) || null;
      } catch (e) {
        persistedLocalStats = null;
      }

      let bestXP = Math.max(localFallback.xp || 0, persistedLocalStats?.xp || 0);
      let finalStats = {
        ...calculateProfileStats(mergedRegular, mergedCustom),
        totalPlaytime: Math.max(
          localFallback.totalPlaytime,
          cloudFloorPlaytime,
          persistedLocalStats?.totalPlaytime || 0
        ),
        gamesPlayed: Math.max(
          localFallback.gamesPlayed,
          persistedLocalStats?.gamesPlayed || 0
        ),
        totalGames: Math.max(
          localFallback.totalGames,
          persistedLocalStats?.totalGames || 0
        ),
      };

      if (bestXP > localFallback.xp) {
        const progress = calculateLevelFromXP(bestXP);
        finalStats = { ...finalStats, ...progress };
      }

      if (hasCloudAccess && user?.uid) {
        try {
          // Ask the server to reconcile from cloudLibrary and write fresh
          // profileStats. Fire-and-forget its own recomputation is fine;
          // we still read back whichever is newest.
          recomputeProfileStats().catch(() => {});
          const cloudProfile = await getProfileStats();
          const cs = cloudProfile?.data;
          if (cs && typeof cs.xp === "number") {
            // Never let a lower cloud value pull the displayed level/XP down.
            bestXP = Math.max(cs.xp || 0, bestXP);
            const progress = calculateLevelFromXP(bestXP);

            finalStats = {
              ...finalStats,
              ...progress,
              totalPlaytime: Math.max(cs.totalPlaytime || 0, finalStats.totalPlaytime),
              gamesPlayed: Math.max(cs.gamesPlayed || 0, finalStats.gamesPlayed),
              totalGames: Math.max(cs.totalGames || 0, finalStats.totalGames),
            };
          }
        } catch (e) {
          console.warn(
            "[Ascend] Cloud-authoritative stats unavailable, using local:",
            e?.message || e
          );
        }
      }

      // Persist the resolved (never-decreasing) stats locally so future
      // loads — and Profile.jsx's own persisted-stats check — see the peak.
      if (window.electron?.setTimestampValue) {
        try {
          await window.electron.setTimestampValue("profileStats", {
            ...persistedLocalStats,
            level: finalStats.level,
            xp: finalStats.xp,
            totalPlaytime: finalStats.totalPlaytime,
            gamesPlayed: finalStats.gamesPlayed,
            totalGames: finalStats.totalGames,
          });
        } catch (e) {
          console.warn("[Ascend] Failed to persist local profileStats:", e);
        }
      }

      console.log("[Ascend] Final stats:", {
        ...finalStats,
        cloudFirst: hasCloudAccess,
      });

      setLocalStats({
        ...finalStats,
        cloudFirst: hasCloudAccess,
      });

      // Recent games — show locally installed entries first (so they remain
      // launchable), but use merged playtime values for accurate ordering.
      const allLocalGames = [...mergedRegular, ...mergedCustom].filter(g => !g.cloudOnly);
      const sortedGames = allLocalGames
        .filter(g => g.playTime && g.playTime >= 60)
        .sort((a, b) => (b.playTime || 0) - (a.playTime || 0))
        .slice(0, 4);
      setRecentGames(sortedGames);

      // Load game images via IPC (no localStorage caching - data URLs blow
      // out the per-origin localStorage quota; IPC is fast)
      const images = {};
      for (const game of sortedGames) {
        try {
          const gameId = game.game || game.name;
          const imageBase64 = await window.electron.getGameImage(gameId);
          if (imageBase64) {
            images[gameId] = `data:image/jpeg;base64,${imageBase64}`;
          }
        } catch (error) {
          console.error("Error loading game image:", error);
        }
      }
      setGameImages(images);
    } catch (e) {
      console.error("Failed to load local stats:", e);
    }
    setLoadingLocalStats(false);
  };

  const verifyAccess = async () => {
    setVerifyingAccess(true);
    try {
      // Get hardware ID from Electron for trial verification
      let hardwareId = null;
      if (window.electron?.getHardwareId) {
        hardwareId = await window.electron.getHardwareId();
      }
      const result = await verifyAscendAccess(hardwareId);
      setAscendAccess({ ...result, verified: true });

      // If trial is expired or user has no access, disconnect all remote access sessions
      if (!result.hasAccess && !result.isSubscribed && !result.isVerified) {
        console.log("[Ascend] Trial expired - disconnecting all remote access sessions");
        try {
          // Load connected devices
          const firebaseToken = await user.getIdToken();
          const devicesResponse = await fetch(
            `https://monitor.ascendara.app/connected-devices/${user.uid}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${firebaseToken}`,
              },
            }
          );

          const devicesData = await devicesResponse.json();
          if (devicesData.success && devicesData.devices) {
            // Disconnect each device
            for (const device of devicesData.devices) {
              try {
                await fetch("https://monitor.ascendara.app/disconnect-device", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${firebaseToken}`,
                  },
                  body: JSON.stringify({
                    sessionId: device.sessionId,
                    userId: user.uid,
                  }),
                });
                console.log("[Ascend] Disconnected session:", device.sessionId);
              } catch (disconnectError) {
                console.error("[Ascend] Error disconnecting session:", disconnectError);
              }
            }
            console.log(
              "[Ascend] All remote access sessions disconnected due to expired trial"
            );
          }
        } catch (error) {
          console.error("[Ascend] Error disconnecting sessions on trial expiry:", error);
        }
      }
    } catch (e) {
      console.error("Failed to verify Ascend access:", e);
      // Default to allowing access on error (fail open for better UX)
      setAscendAccess({
        hasAccess: true,
        daysRemaining: 7,
        isSubscribed: false,
        isVerified: false,
        trialBlocked: false,
        noTrial: false,
        noTrialReason: null,
        verified: true,
      });
    }
    setVerifyingAccess(false);
  };

  const loadUserStatus = async () => {
    if (!user?.uid) return;
    try {
      const result = await getUserStatus(user.uid);
      if (result.data) {
        setUserStatus(result.data.status || "online");
      }
    } catch (e) {
      console.error("Failed to load user status:", e);
    }
  };

  const loadProfileStats = async () => {
    setLoadingProfileStats(true);
    try {
      const result = await getProfileStats();
      if (result.data) {
        setProfileStats(result.data);
      }
    } catch (e) {
      console.error("Failed to load profile stats:", e);
    }
    setLoadingProfileStats(false);
  };

  const handleSyncProfile = async () => {
    setIsSyncingProfile(true);
    try {
      // Server-authoritative: the API at api.ascendara.app recomputes level,
      // XP and playtime from the user's cloudLibrary and persists the result
      // to Firestore. We just need to ensure `joinDate` is preserved (it's
      // only known locally via the user's install timestamp on first sync).
      const joinDate = (await window.electron?.timestampTime?.()) || null;
      if (joinDate) {
        // Preserve joinDate separately — the server doesn't know when the
        // user first installed Ascendara on this machine.
        try {
          await syncProfileToAscend({ joinDate });
        } catch (e) {
          console.warn("[Ascend] joinDate sync failed:", e?.message || e);
        }
      }

      const result = await recomputeProfileStats();
      if (result.success) {
        toast.success(t("ascend.profile.synced"));
        await loadProfileStats();
      } else {
        toast.error(result.error || t("ascend.profile.syncFailed"));
      }
    } catch (e) {
      console.error("Failed to sync profile:", e);
      toast.error(t("ascend.profile.syncFailed"));
    }
    setIsSyncingProfile(false);
  };

  const formatPlaytime = seconds => {
    const hours = Math.floor(seconds / 3600);
    if (hours < 1) return "<1h";
    return `${hours}h`;
  };

  // Leaderboard functions
  const loadLeaderboard = async () => {
    setLoadingLeaderboard(true);
    try {
      const authHeaders = await window.electron.getAuthHeaders();
      const userId = user?.uid || "";
      const response = await fetch(
        `https://api.ascendara.app/ascend/leaderboard${userId ? `?userId=${userId}` : ""}`,
        {
          headers: authHeaders,
        }
      );
      if (response.ok) {
        const data = await response.json();
        // Filter out private accounts from leaderboard
        const filteredData = {
          ...data,
          topThree: data.topThree?.filter(user => !user.private) || [],
          runnerUps: data.runnerUps?.filter(user => !user.private) || [],
        };
        setLeaderboardData(filteredData);
      }
    } catch (e) {
      console.error("Failed to load leaderboard:", e);
    }
    setLoadingLeaderboard(false);
  };

  // Upcoming update functions
  const loadUpcomingChangelog = async () => {
    setLoadingUpcoming(true);
    try {
      const response = await fetch("https://api.ascendara.app/json/changelog/v2");
      if (response.ok) {
        const data = await response.json();
        // Filter to only show entries where release is false (unreleased)
        const unreleasedEntries =
          data.entries?.filter(entry => entry.release === false) || [];
        setUpcomingChangelog(unreleasedEntries);
      }
    } catch (e) {
      console.error("Failed to load upcoming changelog:", e);
    }
    setLoadingUpcoming(false);
  };

  // Cloud Library functions
  const loadCloudLibrary = async () => {
    setLoadingCloudLibrary(true);
    try {
      // Load both cloud data and local games
      const [cloudResult, games, customGames] = await Promise.all([
        getCloudLibrary(),
        window.electron?.getGames?.() || [],
        window.electron?.getCustomGames?.() || [],
      ]);

      if (cloudResult.data) {
        setCloudLibrary(cloudResult.data);
      }

      // Combine local games
      const allLocalGames = [
        ...(games || []).map(g => ({ ...g, isCustom: false })),
        ...(customGames || []).map(g => ({
          ...g,
          game: g.game || g.name,
          isCustom: true,
        })),
      ].filter(g => !g.downloadingData?.downloading && !g.downloadingData?.extracting);

      setLocalGames(allLocalGames);

      // Load images for games
      const images = {};

      // First, load images for local games (no localStorage caching - quota
      // issues with base64 data URLs; IPC reads from disk are fast)
      for (const game of allLocalGames.slice(0, 20)) {
        // Limit to first 20 for performance
        try {
          const gameId = game.game || game.name;
          const imageBase64 = await window.electron.getGameImage(gameId);
          if (imageBase64) {
            images[gameId] = `data:image/jpeg;base64,${imageBase64}`;
          }
        } catch (error) {
          console.error("Error loading game image:", error);
        }
      }

      // Then, load images for cloud-only games (not installed locally) using API
      if (cloudResult.data?.games) {
        const localGameNames = new Set(
          allLocalGames.map(g => (g.game || g.name)?.toLowerCase())
        );
        const cloudOnlyGames = cloudResult.data.games.filter(
          g => !localGameNames.has(g.name?.toLowerCase()) && !g.isCustom && g.gameID
        );

        for (const game of cloudOnlyGames.slice(0, 20)) {
          // Limit for performance (no localStorage caching for data URLs)
          try {
            const response = await fetch(
              `https://api.ascendara.app/v3/image/${game.gameID}`
            );
            if (response.ok) {
              const blob = await response.blob();
              const dataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
              images[game.name] = dataUrl;
            }
          } catch (error) {
            console.error("Error loading cloud game image:", error);
          }
        }
      }

      setCloudLibraryImages(images);
    } catch (e) {
      console.error("Failed to load cloud library:", e);
    }
    setLoadingCloudLibrary(false);
  };

  const handleSyncLibrary = async () => {
    setIsSyncingLibrary(true);
    try {
      // Get games from all directories (main + additional)
      const games = (await window.electron?.getGames?.()) || [];
      const customGames = (await window.electron?.getCustomGames?.()) || [];

      // Filter out games that are downloading
      // Regular games already come from all directories via electron
      const allGames = [
        ...(games || []).filter(
          g => !g.downloadingData?.downloading && !g.downloadingData?.extracting
        ),
        ...(customGames || []).map(g => ({ ...g, isCustom: true })),
      ];

      // Fetch achievements for each game and sync full achievement data
      const gamesWithAchievements = await Promise.all(
        allGames.map(async game => {
          try {
            const gameName = game.game || game.name;
            const isCustom = game.isCustom || game.custom || false;

            // For custom games, check if achievements are stored in the game object itself (achievementWatcher)
            let achievementData = null;

            if (isCustom && game.achievementWatcher?.achievements) {
              // Custom game with achievements stored in games.json
              achievementData = game.achievementWatcher;
            } else {
              // Regular game or custom game with external achievement file
              achievementData = await window.electron?.readGameAchievements?.(
                gameName,
                isCustom
              );
            }

            if (achievementData?.achievements?.length > 0) {
              const totalAchievements = achievementData.achievements.length;
              const unlockedAchievements = achievementData.achievements.filter(
                a => a.achieved
              ).length;

              // Sync full achievement data to cloud (individual game achievements)
              await syncGameAchievements(gameName, isCustom, achievementData);

              return {
                ...game,
                achievementStats: {
                  total: totalAchievements,
                  unlocked: unlockedAchievements,
                  percentage: Math.round(
                    (unlockedAchievements / totalAchievements) * 100
                  ),
                },
              };
            }
          } catch (e) {
            console.warn(
              `Failed to fetch/sync achievements for ${game.game || game.name}:`,
              e
            );
          }
          return { ...game, achievementStats: null };
        })
      );

      const result = await syncCloudLibrary(gamesWithAchievements);
      if (result.success) {
        toast.success(t("ascend.cloudLibrary.synced") || "Library synced to cloud!");
        await loadCloudLibrary();
        try {
          await recomputeProfileStats();
        } catch (e) {
          console.warn("Failed to recompute profile stats after sync:", e);
        }
        await loadLocalStats();
      } else {
        toast.error(
          result.error || t("ascend.cloudLibrary.syncFailed") || "Failed to sync library"
        );
      }
    } catch (e) {
      console.error("Failed to sync library:", e);
      toast.error(t("ascend.cloudLibrary.syncFailed") || "Failed to sync library");
    }
    setIsSyncingLibrary(false);
  };

  // Restore profile + per-game data from cloud into local files.
  // Useful after OS migration / fresh install so that level/XP/playtime
  // and per-game playTime/launchCount/lastPlayed/favorite are rebuilt locally.
  const handleRestoreFromCloud = async () => {
    if (!user) {
      navigate("/ascend");
      return;
    }

    setIsRestoringFromCloud(true);
    let profileRestored = false;
    let profileDerivedFromLibrary = false;
    let gamesRestored = 0;
    let achievementsRestored = 0;

    try {
      // 1. Fetch profile stats and library together so we can fall back to
      //    deriving stats from per-game cloud data when the profile doc is empty
      //    (e.g. user only ever clicked "Sync Library" and never "Sync Profile",
      //    which is the common OS-migration scenario).
      const [statsResult, cloudResult, installedGames, customGames] = await Promise.all([
        getProfileStats(),
        getCloudLibrary(),
        window.electron?.getGames?.() || [],
        window.electron?.getCustomGames?.() || [],
      ]);

      const cloudStats = statsResult?.data || null;
      const cloudGames = cloudResult?.data?.games || [];

      // Decide source of truth for profileStats. If cloud doc has meaningful
      // data, prefer it. Otherwise derive from cloud library games.
      const cloudStatsHasData =
        cloudStats &&
        ((cloudStats.xp || 0) > 0 ||
          (cloudStats.totalPlaytime || 0) > 0 ||
          (cloudStats.level || 1) > 1 ||
          (cloudStats.gamesPlayed || 0) > 0);

      let resolvedStats = null;
      if (cloudStatsHasData) {
        resolvedStats = {
          level: cloudStats.level || 1,
          xp: cloudStats.xp || 0,
          totalPlaytime: cloudStats.totalPlaytime || 0,
          gamesPlayed: cloudStats.gamesPlayed || 0,
          totalGames: cloudStats.totalGames || 0,
          JoinDate: cloudStats.joinDate || null,
        };
      } else if (cloudGames.length > 0) {
        // Derive from cloud library — pass games as the "regular" arg; the
        // calculator only reads playTime/launchCount/completed which exist on
        // both regular and custom cloud entries.
        const derived = calculateProfileStats(cloudGames, []);
        resolvedStats = {
          level: derived.level || 1,
          xp: derived.xp || 0,
          totalPlaytime: derived.totalPlaytime || 0,
          gamesPlayed: derived.gamesPlayed || 0,
          totalGames: derived.totalGames || 0,
          JoinDate: cloudStats?.joinDate || null,
        };
        profileDerivedFromLibrary = true;
      }

      // Write resolved stats into local timestamp file — max-merge with any
      // existing local profileStats so a smaller cloud snapshot never clobbers
      // progress the local machine has already accumulated.
      if (resolvedStats && window.electron?.setTimestampValue) {
        try {
          const localStats =
            (await window.electron?.getTimestampValue?.("profileStats")) || {};
          const mergedStats = {
            level: Math.max(localStats.level || 1, resolvedStats.level || 1),
            xp: Math.max(localStats.xp || 0, resolvedStats.xp || 0),
            totalPlaytime: Math.max(
              localStats.totalPlaytime || 0,
              resolvedStats.totalPlaytime || 0
            ),
            gamesPlayed: Math.max(
              localStats.gamesPlayed || 0,
              resolvedStats.gamesPlayed || 0
            ),
            totalGames: Math.max(
              localStats.totalGames || 0,
              resolvedStats.totalGames || 0
            ),
            JoinDate: localStats.JoinDate || resolvedStats.JoinDate || null,
          };
          resolvedStats = mergedStats;
          await window.electron.setTimestampValue("profileStats", mergedStats);
          profileRestored = true;
        } catch (e) {
          console.warn("Failed to persist restored profileStats locally:", e);
        }

        if (profileDerivedFromLibrary) {
          try {
            await recomputeProfileStats(resolvedStats.JoinDate || null);
          } catch (e) {
            console.warn(
              "Failed to back-fill cloud profileStats from derived library data:",
              e
            );
          }
        }
      }

      // 2. Restore per-game data for games already installed locally
      const allLocal = [
        ...(installedGames || []).map(g => ({
          name: g.game || g.name,
          isCustom: false,
        })),
        ...(customGames || []).map(g => ({
          name: g.game || g.name,
          isCustom: true,
        })),
      ];

      for (const cg of cloudGames) {
        const match = allLocal.find(
          lg => lg.name?.toLowerCase() === cg.name?.toLowerCase()
        );
        if (!match) continue;

        try {
          const restoreResult = await window.electron?.restoreCloudGameData?.(
            match.name,
            {
              playTime: cg.playTime || 0,
              launchCount: cg.launchCount || 0,
              lastPlayed: cg.lastPlayed || null,
              favorite: cg.favorite || false,
            }
          );
          if (restoreResult?.success) {
            gamesRestored += 1;
          }
        } catch (e) {
          console.warn(`Failed to restore game data for ${match.name}:`, e);
        }

        // Also restore full achievement data for this game if available in cloud
        try {
          const achResult = await getGameAchievements(match.name);
          if (achResult?.data && window.electron?.writeGameAchievements) {
            await window.electron.writeGameAchievements(match.name, achResult.data);
            achievementsRestored += 1;
          }
        } catch (e) {
          console.warn(`Failed to restore achievements for ${match.name}:`, e);
        }
      }

      if (!profileRestored && gamesRestored === 0) {
        toast.error(
          t("ascend.cloudLibrary.restoreNothing") ||
            "Nothing to restore — no cloud data found"
        );
      } else {
        const baseMsg =
          t("ascend.cloudLibrary.restored", {
            games: gamesRestored,
            achievements: achievementsRestored,
          }) ||
          `Restored ${profileRestored ? "profile, " : ""}${gamesRestored} game(s), ${achievementsRestored} achievement set(s) from cloud`;
        const suffix = profileDerivedFromLibrary
          ? ` ${t("ascend.cloudLibrary.restoredDerived") || "(profile rebuilt from your cloud library)"}`
          : "";
        toast.success(`${baseMsg}${suffix}`);
        // Refresh visible cloud library panel + profile stats
        await Promise.all([loadCloudLibrary(), loadProfileStats()]);
      }
    } catch (e) {
      console.error("Failed to restore from cloud:", e);
      toast.error(
        t("ascend.cloudLibrary.restoreFailed") || "Failed to restore from cloud"
      );
    }
    setIsRestoringFromCloud(false);
  };

  // Check if a cloud game is installed locally
  const isGameInstalledLocally = gameName => {
    return localGames.some(g => {
      const localName = g.game || g.name;
      return localName?.toLowerCase() === gameName?.toLowerCase();
    });
  };

  // Filter and sort cloud library games
  const getFilteredLibraryGames = () => {
    let games = cloudLibrary?.games || [];

    // Filter by search
    if (librarySearchQuery) {
      const query = librarySearchQuery.toLowerCase();
      games = games.filter(g => g.name.toLowerCase().includes(query));
    }

    // Sort
    switch (librarySortBy) {
      case "playtime":
        games = [...games].sort((a, b) => (b.playTime || 0) - (a.playTime || 0));
        break;
      case "recent":
        games = [...games].sort((a, b) => {
          const aTime = a.lastPlayed ? new Date(a.lastPlayed).getTime() : 0;
          const bTime = b.lastPlayed ? new Date(b.lastPlayed).getTime() : 0;
          return bTime - aTime;
        });
        break;
      case "achievements":
        games = [...games].sort((a, b) => {
          const aAch = a.achievementStats?.unlocked || 0;
          const bAch = b.achievementStats?.unlocked || 0;
          return bAch - aAch;
        });
        break;
      case "name":
      default:
        games = [...games].sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return games;
  };

  // Handle expanding a game to view achievements
  const handleExpandGame = async gameName => {
    if (expandedGame === gameName) {
      setExpandedGame(null);
      setGameAchievements(null);
      return;
    }

    setExpandedGame(gameName);
    setLoadingGameAchievements(true);
    setGameAchievements(null);

    try {
      const result = await getGameAchievements(gameName);
      if (result.data) {
        setGameAchievements(result.data);
      }
    } catch (e) {
      console.error("Failed to load game achievements:", e);
    }
    setLoadingGameAchievements(false);
  };

  // Handle deleting a game from cloud
  const handleDeleteCloudGame = async gameName => {
    setDeletingGame(gameName);
    try {
      const result = await deleteCloudGame(gameName);
      if (result.success) {
        toast.success(t("ascend.cloudLibrary.gameDeleted") || "Game removed from cloud");
        await loadCloudLibrary();
        setExpandedGame(null);
        setGameAchievements(null);
      } else {
        toast.error(
          result.error || t("ascend.cloudLibrary.deleteFailed") || "Failed to delete game"
        );
      }
    } catch (e) {
      console.error("Failed to delete cloud game:", e);
      toast.error(t("ascend.cloudLibrary.deleteFailed") || "Failed to delete game");
    }
    setDeletingGame(null);
    setShowDeleteConfirm(null);
  };

  // Format playtime in a detailed way
  const formatPlaytimeDetailed = seconds => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  const loadFriendsData = async () => {
    setLoadingFriends(true);
    const result = await getFriendsList();
    if (!result.error) {
      setFriends(result.friends);
    }
    setLoadingFriends(false);
  };

  const loadRequestsData = async () => {
    setLoadingRequests(true);
    const [incoming, outgoing] = await Promise.all([
      getIncomingRequests(),
      getOutgoingRequests(),
    ]);
    if (!incoming.error) setIncomingRequests(incoming.requests);
    if (!outgoing.error) setOutgoingRequests(outgoing.requests);
    setLoadingRequests(false);
  };

  const loadConversations = async () => {
    setLoadingConversations(true);
    try {
      const result = await getConversations();
      if (!result.error) {
        setConversations(result.conversations);
      }
    } catch (e) {
      console.error("Failed to load conversations:", e);
    }
    setLoadingConversations(false);
  };

  const loadNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const result = await getNotifications();
      if (!result.error) {
        setNotifications(result.notifications);
      }
    } catch (e) {
      console.error("Failed to load notifications:", e);
    }
    setLoadingNotifications(false);
  };

  const loadBackups = async (gameName = null) => {
    setLoadingBackups(true);
    try {
      const result = await listBackups(gameName);
      if (!result.error) {
        // Check which backups exist locally
        const backupsWithLocalCheck = await Promise.all(
          result.backups.map(async backup => {
            if (retroBackupPlatform(backup.gameName))
              return { ...backup, existsLocally: false };
            let existsLocally = false;

            try {
              const backupLocation = settings.ludusavi?.backupLocation;
              if (backupLocation) {
                const gameBackupFolder = `${backupLocation}/${backup.gameName}`;
                const backupFiles =
                  await window.electron.listBackupFiles(gameBackupFolder);

                if (backupFiles && backupFiles.length > 0) {
                  existsLocally = backupFiles.some(
                    f =>
                      f.includes(backup.backupName) ||
                      backup.backupName.includes(f.replace(".zip", ""))
                  );
                }
              }
            } catch (err) {
              console.warn(`Failed to check local backup for ${backup.gameName}:`, err);
            }

            return {
              ...backup,
              existsLocally,
            };
          })
        );

        setBackups(backupsWithLocalCheck);
      } else if (result.code === "SUBSCRIPTION_REQUIRED") {
        toast.error(
          t("ascend.cloudBackups.subscriptionRequired") ||
            "Active Ascend subscription required"
        );
      } else {
        toast.error(result.error);
      }
    } catch (e) {
      console.error("Failed to load backups:", e);
      toast.error(t("ascend.cloudBackups.loadError") || "Failed to load backups");
    }
    setLoadingBackups(false);
  };

  const handleBackupFileSelect = event => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 100 * 1024 * 1024) {
        toast.error(
          t("ascend.cloudBackups.fileTooLarge") || "File too large (max 100MB)"
        );
        return;
      }
      setSelectedBackupFile(file);
    }
  };

  const handleUploadBackup = async () => {
    if (!selectedBackupFile || !backupGameName.trim() || !backupName.trim()) {
      toast.error(t("ascend.cloudBackups.fillAllFields") || "Please fill in all fields");
      return;
    }

    setUploadingBackup(true);
    try {
      const result = await uploadBackup(selectedBackupFile, backupGameName, backupName);
      if (result.success) {
        toast.success(
          t("ascend.cloudBackups.uploadSuccess") || "Backup uploaded successfully"
        );
        setSelectedBackupFile(null);
        setBackupGameName("");
        setBackupName("");
        loadBackups(backupFilterGame || null);
      } else if (result.code === "SUBSCRIPTION_REQUIRED") {
        toast.error(
          t("ascend.cloudBackups.subscriptionRequired") ||
            "Active Ascend subscription required"
        );
      } else {
        toast.error(result.error);
      }
    } catch (e) {
      console.error("Failed to upload backup:", e);
      toast.error(t("ascend.cloudBackups.uploadError") || "Failed to upload backup");
    }
    setUploadingBackup(false);
  };

  const handleDownloadBackup = async (backupId, backupName) => {
    try {
      const result = await getBackupDownloadUrl(backupId);
      if (result.downloadUrl) {
        window.electron.openExternal(result.downloadUrl);
        toast.success(t("ascend.cloudBackups.downloadStarted") || "Download started");
      } else if (result.code === "SUBSCRIPTION_REQUIRED") {
        toast.error(
          t("ascend.cloudBackups.subscriptionRequired") ||
            "Active Ascend subscription required"
        );
      } else {
        toast.error(result.error);
      }
    } catch (e) {
      console.error("Failed to download backup:", e);
      toast.error(t("ascend.cloudBackups.downloadError") || "Failed to download backup");
    }
  };

  const handleRestoreBackup = async (backupId, gameName, backupName) => {
    setRestoringBackup(backupId);
    try {
      const retroPlatform = retroBackupPlatform(gameName);
      if (retroPlatform) {
        const result = await restoreRetroCloudBackup(retroPlatform, backupId);
        if (result) toast.success(`Restored ${result.restored} Retro save files`);
        setRestoringBackup(null);
        return;
      }
      // Get download URL from backend
      const result = await getBackupDownloadUrl(backupId);
      if (!result.downloadUrl) {
        if (result.code === "SUBSCRIPTION_REQUIRED") {
          toast.error(
            t("ascend.cloudBackups.subscriptionRequired") ||
              "Active Ascend subscription required"
          );
        } else {
          toast.error(result.error || "Failed to get download URL");
        }
        setRestoringBackup(null);
        return;
      }

      // Download the backup file
      toast.info(
        t("ascend.cloudBackups.downloadingBackup") || "Downloading backup from cloud..."
      );

      const response = await fetch(result.downloadUrl);
      if (!response.ok) {
        throw new Error("Failed to download backup file");
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      // Save to temp location
      const tempPath = await window.electron.getTempPath();
      const backupFilePath = `${tempPath}/ascendara-restore-${crypto.randomUUID()}.zip`;
      await window.electron.writeFile(backupFilePath, buffer);

      // Extract and restore using Ludusavi
      toast.info(t("ascend.cloudBackups.restoringBackup") || "Restoring backup...");

      const restoreResult = await window.electron.ludusavi({
        action: "restore",
        gameName: gameName,
        path: backupFilePath,
      });

      if (restoreResult.success) {
        toast.success(
          t("ascend.cloudBackups.restoreSuccess") || "Backup restored successfully"
        );
      } else {
        toast.error(
          restoreResult.error ||
            t("ascend.cloudBackups.restoreError") ||
            "Failed to restore backup"
        );
      }

      // Clean up temp file
      try {
        await window.electron.deleteFile(backupFilePath);
      } catch (cleanupErr) {
        console.warn("Failed to clean up temp file:", cleanupErr);
      }
    } catch (e) {
      console.error("Failed to restore backup:", e);
      toast.error(t("ascend.cloudBackups.restoreError") || "Failed to restore backup");
    }
    setRestoringBackup(null);
  };

  const handleDeleteBackup = async backupId => {
    setDeletingBackup(backupId);
    try {
      const result = await deleteBackup(backupId);
      if (result.success) {
        toast.success(
          t("ascend.cloudBackups.deleteSuccess") || "Backup deleted successfully"
        );
        loadBackups(backupFilterGame || null);
      } else if (result.code === "SUBSCRIPTION_REQUIRED") {
        toast.error(
          t("ascend.cloudBackups.subscriptionRequired") ||
            "Active Ascend subscription required"
        );
      } else {
        toast.error(result.error);
      }
    } catch (e) {
      console.error("Failed to delete backup:", e);
      toast.error(t("ascend.cloudBackups.deleteError") || "Failed to delete backup");
    }
    setDeletingBackup(null);
  };

  const handleSelectConversation = async conversation => {
    // The message listener only restarts when the conversation ID changes.
    if (!conversation?.id || conversation.id === selectedConversation?.id) return;

    setSelectedConversation(conversation);
    setLoadingMessages(true);
    try {
      // Mark messages as read (real-time listener will update UI automatically)
      await markMessagesAsRead(conversation.id);
    } catch (e) {
      console.error("Failed to mark messages as read:", e);
    }
    // Scroll to bottom after a short delay to ensure messages are rendered
    setTimeout(() => {
      if (messagesEndRef.current) {
        const viewport = messagesEndRef.current.closest("[data-message-scroll]");
        viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "instant" });
      }
    }, 100);
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation) return;
    setSendingMessage(true);
    try {
      const result = await sendMessage(selectedConversation.id, messageInput);
      if (result.success) {
        setMessageInput("");
        // Real-time listeners will automatically update messages and conversations
      } else {
        toast.error(result.error);
      }
    } catch (e) {
      console.error("Failed to send message:", e);
      toast.error("Failed to send message");
    }
    setSendingMessage(false);
  };

  const handleStartConversation = async friendUid => {
    try {
      const result = await getOrCreateConversation(friendUid);
      if (result.conversationId) {
        // Find the friend data
        const friend = friends.find(f => f.uid === friendUid);
        // Real-time listener will update conversations automatically
        // Just select the conversation
        const newConversation = {
          id: result.conversationId,
          otherUser: friend,
          lastMessage: null,
          unreadCount: 0,
        };
        handleSelectConversation(newConversation);
        setActiveSection("messages");
      }
    } catch (e) {
      console.error("Failed to start conversation:", e);
      toast.error("Failed to start conversation");
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const result = await searchUsers(searchQuery);
    if (!result.error) {
      setSearchResults(result.users.filter(u => u.uid !== user?.uid));
    } else {
      toast.error(result.error);
    }
    setIsSearching(false);
  };

  const getRelationshipStatus = uid => {
    if (friends.some(f => f.uid === uid)) {
      return "friend";
    }
    if (outgoingRequests.some(r => r.toUid === uid)) {
      return "requestSent";
    }
    if (incomingRequests.some(r => r.fromUid === uid)) {
      return "requestReceived";
    }
    return "none";
  };

  const handleSendRequest = async toUid => {
    if (toUid === user?.uid) {
      toast.error(
        t("ascend.friends.cannotAddSelf") || "You cannot add yourself as a friend"
      );
      return;
    }

    const status = getRelationshipStatus(toUid);
    if (status !== "none") {
      if (status === "friend") {
        toast.info(t("ascend.friends.alreadyFriends") || "Already friends");
      } else if (status === "requestSent") {
        toast.info(
          t("ascend.friends.requestAlreadySent") || "Friend request already sent"
        );
      } else if (status === "requestReceived") {
        toast.info(
          t("ascend.friends.hasRequestPending") ||
            "This user has sent you a friend request"
        );
      }
      return;
    }

    const result = await sendFriendRequest(toUid);
    if (result.success) {
      toast.success(t("ascend.friends.requestSent"));
    } else {
      toast.error(result.error);
    }
  };

  // View a user's public profile
  const handleViewProfile = async (userId, returnSection = "search") => {
    setLoadingProfile(true);
    setProfileError(null);
    setProfileReturnSection(returnSection);
    setActiveSection("userProfile");

    const result = await getUserPublicProfile(userId);
    if (result.data) {
      setViewingProfile(result.data);
    } else {
      setProfileError(result.error || "Failed to load profile");
    }
    setLoadingProfile(false);
  };

  // Go back from profile view
  const handleBackFromProfile = () => {
    setViewingProfile(null);
    setProfileError(null);
    setActiveSection(profileReturnSection);
  };

  // Submit user report
  const handleSubmitUserReport = async () => {
    if (!reportUserReason || !reportUserDetails.trim()) {
      toast.error(t("ascend.report.fillAllFields") || "Please fill in all fields");
      return;
    }

    setIsReportingUser(true);
    try {
      const authHeaders = await window.electron.getAuthHeaders();
      const response = await fetch("https://api.ascendara.app/auth/token", {
        headers: authHeaders,
      });

      if (!response.ok) {
        throw new Error("Failed to obtain token");
      }

      const { token: authToken } = await response.json();

      const reportResponse = await fetch("https://api.ascendara.app/app/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          reportType: "UserReport",
          reason: reportUserReason,
          details: reportUserDetails,
          gameName: `User: ${viewingProfile?.displayName || "Unknown"} (${viewingProfile?.uid || "Unknown UID"})`,
        }),
      });

      if (!reportResponse.ok) {
        if (reportResponse.status === 401) {
          const newAuthHeaders = await window.electron.getAuthHeaders();
          const newTokenResponse = await fetch("https://api.ascendara.app/auth/token", {
            headers: newAuthHeaders,
          });

          if (!newTokenResponse.ok) {
            throw new Error("Failed to obtain new token");
          }

          const { token: newAuthToken } = await newTokenResponse.json();

          const retryResponse = await fetch("https://api.ascendara.app/app/report", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newAuthToken}`,
            },
            body: JSON.stringify({
              reportType: "UserReport",
              reason: reportUserReason,
              details: reportUserDetails,
              gameName: `User: ${viewingProfile?.displayName || "Unknown"} (${viewingProfile?.uid || "Unknown UID"})`,
            }),
          });

          if (retryResponse.ok) {
            toast.success(
              t("ascend.report.submitted") || "Report submitted successfully"
            );
            setReportUserReason("");
            setReportUserDetails("");
            setReportDialogOpen(false);
            return;
          }
        }
        throw new Error("Failed to submit report");
      }

      toast.success(t("ascend.report.submitted") || "Report submitted successfully");
      setReportUserReason("");
      setReportUserDetails("");
      setReportDialogOpen(false);
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error(t("ascend.report.failed") || "Failed to submit report");
    } finally {
      setIsReportingUser(false);
    }
  };

  const handleAcceptRequest = async (requestId, fromUid) => {
    const result = await acceptFriendRequest(requestId, fromUid);
    if (result.success) {
      toast.success(t("ascend.friends.requestAccepted"));
    } else {
      toast.error(result.error);
    }
  };

  const handleDenyRequest = async requestId => {
    const result = await denyFriendRequest(requestId);
    if (result.success) {
      toast.success(t("ascend.friends.requestDenied"));
    } else {
      toast.error(result.error);
    }
  };

  const handleRemoveFriend = async friendUid => {
    const result = await removeFriend(friendUid);
    if (result.success) {
      toast.success(t("ascend.friends.removed"));
    } else {
      toast.error(result.error);
    }
  };

  const handleStartEditProfile = () => {
    setEditDisplayName(user?.displayName || "");
    setEditPhotoURL(user?.photoURL || "");
    setEditBio(userData?.bio || "");
    setEditCountry(userData?.country || "");
    setEditDiscord(userData?.socials?.linkedDiscord || "");
    setEditEpicId(userData?.socials?.epicId || "");
    setEditGithub(userData?.socials?.github || "");
    setEditSteam(userData?.socials?.steam || "");
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (editDisplayName.trim().length < 4) {
      toast.error(t("account.errors.displayNameTooShort"));
      return;
    }

    if (editBio.length > 100) {
      toast.error(t("ascend.settings.bioTooLong"));
      return;
    }

    // Validate display name for profanity
    const displayNameValidation = await validateInput(
      editDisplayName.trim(),
      userData?.owner
    );
    if (!displayNameValidation.valid) {
      if (displayNameValidation.type === "notAllowed") {
        toast.error(
          t("ascend.settings.notAllowedDisplayName") ||
            "Display name contains words that are not allowed"
        );
      } else {
        toast.error(
          t("ascend.settings.inappropriateDisplayName") ||
            "Please try to avoid harsh or inappropriate words in your display name"
        );
      }
      return;
    }

    // Validate bio for profanity
    if (editBio.trim()) {
      const bioValidation = await validateInput(editBio.trim(), userData?.owner);
      if (!bioValidation.valid) {
        if (bioValidation.type === "notAllowed") {
          toast.error(
            t("ascend.settings.notAllowedBio") ||
              "Bio contains words that are not allowed"
          );
        } else {
          toast.error(
            t("ascend.settings.inappropriateBio") ||
              "Please try to avoid harsh or inappropriate words in your bio"
          );
        }
        return;
      }
    }

    setIsSavingProfile(true);

    // Update basic profile (display name, photo)
    const updates = { displayName: editDisplayName.trim() };
    if (editPhotoURL.trim()) {
      updates.photoURL = editPhotoURL.trim();
    }

    const result = await updateProfile(updates);

    // Update extended profile (bio, country, socials) using updateData to refresh userData
    const extendedResult = await updateData({
      bio: editBio.trim(),
      country: editCountry.trim(),
      socials: {
        linkedDiscord: userData?.socials?.linkedDiscord || "",
        epicId: editEpicId.trim(),
        github: editGithub.trim(),
        steam: editSteam.trim(),
      },
    });

    if (result.success && extendedResult.success) {
      toast.success(t("ascend.settings.profileUpdated"));
      setIsEditingProfile(false);
      // Reload user to get updated data
      await reloadUser();
    } else {
      toast.error(
        result.error || extendedResult.error || t("account.errors.updateFailed")
      );
    }
    setIsSavingProfile(false);
  };

  const handleCancelEditProfile = () => {
    setIsEditingProfile(false);
    setEditDisplayName("");
    setEditPhotoURL("");
    setEditBio("");
    setEditCountry("");
    setEditDiscord("");
    setEditEpicId("");
    setEditGithub("");
    setEditSteam("");
  };

  // Subscribe to Ascend via Stripe Checkout
  const handleSubscribe = async () => {
    try {
      // Validate account exists and is not deleted
      if (!user || !user.uid) {
        toast.error(t("account.errors.notLoggedIn") || "Please log in to subscribe");
        return;
      }

      // Check if hardware ID is associated with a deleted account
      let hardwareId = null;
      if (window.electron?.getHardwareId) {
        hardwareId = await window.electron.getHardwareId();
      }

      if (hardwareId) {
        const deletedCheck = await checkDeletedAccount(hardwareId);
        if (deletedCheck.isDeleted) {
          toast.error(
            t("account.errors.cannotSubscribeDeleted") ||
              "Cannot subscribe - this device is associated with a deleted account. Please contact support."
          );
          setDeletedAccountWarning(true);
          return;
        }
      }

      // Require the signed-in user's Firebase credentials before checkout.
      try {
        const authHeaders = await getUserAuthHeaders(user);
        if (!authHeaders.Authorization) {
          toast.error(
            t("account.errors.authenticationFailed") ||
              "Authentication failed. Please try again."
          );
          return;
        }
      } catch (authError) {
        console.error("Authentication error:", authError);
        toast.error(
          t("account.errors.authenticationFailed") ||
            "Authentication failed. Please try again."
        );
        return;
      }

      const productResponse = await fetch(
        "https://api.ascendara.app/stripe/products/prod_TZdRiUAwPpMEjW"
      );
      if (!productResponse.ok) {
        toast.error(t("ascend.settings.checkoutError"));
        return;
      }
      const product = await productResponse.json();
      console.log("Product data:", product);

      // Filter and organize plans (1 month, 6 month, lifetime)
      // Exclude the duplicate price_1ScUAMCfu5zjwIKZd4FezEnW and 3-month plan price_1SrPMrCfu5zjwIKZTIRsRAZG
      const plans =
        product.prices
          ?.filter(
            price =>
              price.interval === "month" &&
              price.id !== "price_1ScUAMCfu5zjwIKZd4FezEnW" &&
              price.id !== "price_1SrPMrCfu5zjwIKZTIRsRAZG"
          )
          .map(price => ({
            id: price.id,
            intervalCount: price.intervalCount,
            unitAmount: price.unitAmount,
            currency: price.currency,
          }))
          .sort((a, b) => a.intervalCount - b.intervalCount) || [];

      // Add lifetime plan manually
      plans.push({
        id: "price_1TKjjMCfu5zjwIKZyrWXZFJ1",
        intervalCount: 0, // 0 indicates lifetime
        unitAmount: 2900, // $29.00
        currency: "usd",
      });

      console.log("Filtered plans:", plans);

      if (plans.length === 0) {
        toast.error(t("ascend.settings.checkoutError"));
        return;
      }

      console.log("Opening plan dialog with plans:", plans);
      setAvailablePlans(plans);
      setShowPlanDialog(true);
    } catch (error) {
      console.error("Error fetching subscription plans:", error);
      toast.error(t("ascend.settings.checkoutError"));
    }
  };

  // Process subscription checkout with selected plan
  const handlePlanSelection = async priceId => {
    try {
      setShowPlanDialog(false);

      // The API calculates any eligible lifetime discount during checkout.

      const response = await userAuthenticatedFetch(
        user,
        "https://api.ascendara.app/stripe/create-checkout-session",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.uid,
            priceId: priceId,
            successUrl: "https://ascendara.app/thank-you?subscription=success",
            cancelUrl: "ascendara://checkout-canceled",
          }),
        }
      );

      if (response.ok) {
        const { url } = await response.json();
        window.electron?.openURL?.(url);
      } else {
        toast.error(t("ascend.settings.checkoutError"));
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      toast.error(t("ascend.settings.checkoutError"));
    }
  };

  // Open Stripe Customer Portal for managing subscription
  const handleManageSubscription = async () => {
    try {
      const response = await userAuthenticatedFetch(
        user,
        "https://api.ascendara.app/stripe/customer-portal",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.uid,
            returnUrl: "ascendara://checkout-canceled",
          }),
        }
      );
      if (response.ok) {
        const { url } = await response.json();
        window.electron?.openURL?.(url);
      } else {
        toast.error(t("ascend.settings.portalError"));
      }
    } catch (error) {
      console.error("Error opening customer portal:", error);
      toast.error(t("ascend.settings.portalError"));
    }
  };

  // Open Stripe Customer Portal for viewing invoices
  const handleViewInvoices = async () => {
    try {
      const response = await userAuthenticatedFetch(
        user,
        "https://api.ascendara.app/stripe/customer-portal",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.uid,
            returnUrl: "ascendara://checkout-canceled",
          }),
        }
      );
      if (response.ok) {
        const { url } = await response.json();
        window.electron?.openURL?.(url);
      } else {
        toast.error(t("ascend.settings.portalError"));
      }
    } catch (error) {
      console.error("Error opening customer portal:", error);
      toast.error(t("ascend.settings.portalError"));
    }
  };

  // Handle checkout success callback from protocol with retry logic
  const handleCheckoutSuccess = async (sessionId, retryCount = 0, maxRetries = 5) => {
    const MAX_RETRIES = maxRetries;
    const BASE_DELAY = 2000;

    try {
      // User might not be loaded yet when protocol callback fires
      if (!user?.uid) {
        console.log("User not loaded yet, waiting...");
        // Wait a bit for user to load and retry
        setTimeout(() => handleCheckoutSuccess(sessionId, retryCount, maxRetries), 1000);
        return;
      }

      console.log(`Verifying checkout (attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`);

      const response = await userAuthenticatedFetch(
        user,
        "https://api.ascendara.app/stripe/verify-checkout",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: sessionId,
            userId: user.uid,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log("Checkout verification successful!");
          // Backend updates Firestore directly via Admin SDK
          setShowSubscriptionSuccess(true);
          // Refresh access status
          verifyAccess();
          return;
        } else {
          // Backend returned an error - this might be a permanent failure
          console.error("Checkout verification failed:", data.message);

          // Retry on certain error messages that might be transient
          const transientErrors = ["database", "timeout", "temporary", "try again"];
          const isTransient = transientErrors.some(keyword =>
            data.message?.toLowerCase().includes(keyword)
          );

          if (isTransient && retryCount < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, retryCount);
            console.log(`Transient error detected, retrying in ${delay}ms...`);
            setTimeout(
              () => handleCheckoutSuccess(sessionId, retryCount + 1, maxRetries),
              delay
            );
            return;
          }

          toast.error(data.message || t("ascend.settings.paymentNotCompleted"));
        }
      } else {
        // Network or server error - definitely retry
        console.error(`Checkout verification failed with status ${response.status}`);

        if (retryCount < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, retryCount);
          console.log(`Server error (${response.status}), retrying in ${delay}ms...`);

          // Show a toast on first retry to inform user
          if (retryCount === 0) {
            toast.info(
              t("ascend.settings.verifyingPayment") ||
                "Verifying your payment, please wait...",
              {
                duration: delay,
              }
            );
          }

          setTimeout(
            () => handleCheckoutSuccess(sessionId, retryCount + 1, maxRetries),
            delay
          );
          return;
        } else {
          // Max retries exceeded - show persistent error with instructions
          console.error("Max retries exceeded for checkout verification");
          toast.error(
            t("ascend.settings.verifyCheckoutRetryFailed") ||
              "Unable to verify your payment. Please contact support with your session ID if you were charged.",
            { duration: 10000 }
          );
          // Log session ID for support
          console.error("Session ID for support:", sessionId);
        }
      }
    } catch (error) {
      console.error("Error verifying checkout:", error);

      // Retry on network errors
      if (retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, retryCount);
        console.log(`Network error, retrying in ${delay}ms...`);

        // Show a toast on first retry to inform user
        if (retryCount === 0) {
          toast.info(
            t("ascend.settings.verifyingPayment") ||
              "Verifying your payment, please wait...",
            {
              duration: delay,
            }
          );
        }

        setTimeout(
          () => handleCheckoutSuccess(sessionId, retryCount + 1, maxRetries),
          delay
        );
        return;
      } else {
        // Max retries exceeded
        console.error("Max retries exceeded for checkout verification");
        toast.error(
          t("ascend.settings.verifyCheckoutRetryFailed") ||
            "Unable to verify your payment. Please contact support with your session ID if you were charged.",
          { duration: 10000 }
        );
        // Log session ID for support
        console.error("Session ID for support:", sessionId);
      }
    }
  };

  // Handle checkout canceled callback from protocol
  const handleCheckoutCanceled = () => {
    toast.info(t("ascend.settings.checkoutCanceled"));
  };

  // Listen for checkout protocol callbacks
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    const onCheckoutSuccess = (event, data) => {
      console.log("Checkout success received:", data);
      if (data?.sessionId) {
        handleCheckoutSuccess(data.sessionId);
      }
    };

    const onCheckoutCanceled = () => {
      console.log("Checkout canceled received");
      handleCheckoutCanceled();
    };

    window.electron.ipcRenderer.on("checkout-success", onCheckoutSuccess);
    window.electron.ipcRenderer.on("checkout-canceled", onCheckoutCanceled);

    return () => {
      window.electron.ipcRenderer.removeListener("checkout-success", onCheckoutSuccess);
      window.electron.ipcRenderer.removeListener("checkout-canceled", onCheckoutCanceled);
    };
  }, [user?.uid]);

  // Check email verification every 5 seconds
  useEffect(() => {
    if (
      user &&
      !user.emailVerified &&
      user.providerData?.[0]?.providerId === "password"
    ) {
      console.log("Starting email verification polling...");
      const interval = setInterval(async () => {
        console.log("Checking email verification...");
        const result = await reloadUser();
        console.log("Reload result:", result);
      }, 5000);
      return () => {
        console.log("Stopping email verification polling");
        clearInterval(interval);
      };
    }
  }, [user?.emailVerified, reloadUser]);

  // Form state
  const [formData, setFormData] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleInputChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) clearError();
  };

  const handleGoogleSignIn = async () => {
    console.log("[handleGoogleSignIn] Starting Google sign-in flow...");
    setIsGoogleLoading(true);
    setAccountExistsError(null);

    // Check if this hardware already has an account (only for new signups)
    let hardwareId = null;
    if (window.electron?.getHardwareId) {
      hardwareId = await window.electron.getHardwareId();
      console.log(
        "[handleGoogleSignIn] Hardware ID obtained:",
        hardwareId ? "yes" : "no"
      );
    }

    console.log("[handleGoogleSignIn] Calling googleSignIn()...");
    const result = await googleSignIn();
    console.log("[handleGoogleSignIn] googleSignIn() returned:", {
      hasUser: !!result.user,
      isNewUser: result.isNewUser,
      error: result.error,
    });
    if (result.user) {
      console.log("[handleGoogleSignIn] User signed in successfully");
      if (result.isNewUser) {
        console.log("[handleGoogleSignIn] New user detected, checking hardware ID...");
        // Check if hardware ID already has an account
        if (hardwareId) {
          // First check if this hardware ID is associated with a deleted account
          console.log("[handleGoogleSignIn] Checking for deleted account...");
          const deletedCheck = await checkDeletedAccount(hardwareId);
          if (deletedCheck.isDeleted) {
            console.log(
              "[handleGoogleSignIn] Hardware ID has deleted account, removing new account"
            );
            // Delete the newly created account and show deleted account error
            await deleteNewAccount();
            setAccountExistsError({ email: deletedCheck.email, isDeleted: true });
            setIsGoogleLoading(false);
            return;
          }

          console.log(
            "[handleGoogleSignIn] Checking if hardware ID has existing account..."
          );
          const hwCheck = await checkHardwareIdAccount(hardwareId);
          console.log("[handleGoogleSignIn] Hardware ID check result:", {
            hasAccount: hwCheck.hasAccount,
            userId: hwCheck.userId,
            currentUserId: result.user.uid,
          });

          // Only treat it as a duplicate if the hardware ID belongs to a DIFFERENT user
          if (hwCheck.hasAccount && hwCheck.userId !== result.user.uid) {
            console.log(
              "[handleGoogleSignIn] Hardware ID belongs to different account, removing new account"
            );
            // Delete the newly created account and show error
            await deleteNewAccount();
            setAccountExistsError({ email: hwCheck.email, isDeleted: false });
            setIsGoogleLoading(false);
            return;
          }

          console.log(
            "[handleGoogleSignIn] Hardware ID check passed (either no account or belongs to current user)"
          );
          // Register the hardware ID for this new user
          console.log("[handleGoogleSignIn] Registering hardware ID for new user...");
          await registerHardwareId(hardwareId, result.user.uid);
        }
        // New user - prompt for display name
        console.log("[handleGoogleSignIn] Showing display name prompt for new user");
        setGoogleDisplayName(result.user.displayName || "");
        setShowDisplayNamePrompt(true);
      } else {
        console.log("[handleGoogleSignIn] Existing user logged in successfully");
        toast.success(t("account.success.loggedIn"));
      }
    } else if (result.error) {
      console.log("[handleGoogleSignIn] Sign-in error:", result.error);
      toast.error(result.error);
    } else {
      console.log(
        "[handleGoogleSignIn] Sign-in returned no user and no error (cancelled or redirecting)"
      );
    }
    console.log("[handleGoogleSignIn] Google sign-in flow complete");
    setIsGoogleLoading(false);
  };

  const handleGoogleDisplayNameSubmit = async () => {
    if (googleDisplayName.trim().length < 4) {
      toast.error(t("account.errors.displayNameTooShort"));
      return;
    }

    // Validate display name for profanity (no owner bypass on signup)
    const displayNameValidation = await validateInput(googleDisplayName.trim(), false);
    if (!displayNameValidation.valid) {
      if (displayNameValidation.type === "notAllowed") {
        toast.error(
          t("ascend.settings.notAllowedDisplayName") ||
            "Display name contains words that are not allowed"
        );
      } else {
        toast.error(
          t("ascend.settings.inappropriateDisplayName") ||
            "Please try to avoid harsh or inappropriate words in your display name"
        );
      }
      return;
    }

    setIsSubmitting(true);
    const result = await updateProfile({ displayName: googleDisplayName.trim() });
    if (result.success) {
      toast.success(t("account.success.registered"));
      setShowDisplayNamePrompt(false);
    } else {
      toast.error(result.error || t("account.errors.updateFailed"));
    }
    setIsSubmitting(false);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setIsSubmitting(true);
    setAccountExistsError(null);

    // Common validation for both login and signup
    if (!formData.email.trim()) {
      toast.error(t("account.errors.emailRequired"));
      setIsSubmitting(false);
      return;
    }
    if (!formData.password) {
      toast.error(t("account.errors.passwordRequired"));
      setIsSubmitting(false);
      return;
    }

    if (!isLogin) {
      // Registration validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        toast.error(t("account.errors.invalidEmail"));
        setIsSubmitting(false);
        return;
      }
      if (formData.displayName.trim().length < 4) {
        toast.error(t("account.errors.displayNameTooShort"));
        setIsSubmitting(false);
        return;
      }

      // Validate display name for profanity (no owner bypass on signup)
      const displayNameValidation = await validateInput(
        formData.displayName.trim(),
        false
      );
      if (!displayNameValidation.valid) {
        if (displayNameValidation.type === "notAllowed") {
          toast.error(
            t("ascend.settings.notAllowedDisplayName") ||
              "Display name contains words that are not allowed"
          );
        } else {
          toast.error(
            t("ascend.settings.inappropriateDisplayName") ||
              "Please try to avoid harsh or inappropriate words in your display name"
          );
        }
        setIsSubmitting(false);
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        toast.error(t("account.errors.passwordMismatch"));
        setIsSubmitting(false);
        return;
      }
      // Password: at least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
      if (!passwordRegex.test(formData.password)) {
        toast.error(t("account.errors.passwordRequirements"));
        setIsSubmitting(false);
        return;
      }

      // Show email confirmation dialog before proceeding with signup
      setPendingSignupData({ ...formData });
      setShowEmailConfirmDialog(true);
      setIsSubmitting(false);
      return;
    } else {
      // Login
      const result = await login(formData.email, formData.password);
      if (result.user) {
        // Check if this hardware ID belongs to a deleted account
        let hardwareId = null;
        if (window.electron?.getHardwareId) {
          hardwareId = await window.electron.getHardwareId();
        }
        if (hardwareId) {
          const deletedCheck = await checkDeletedAccount(hardwareId);
          if (deletedCheck.isDeleted) {
            setDeletedAccountWarning(true);
          }
        }
        toast.success(t("account.success.loggedIn"));
      } else if (result.error) {
        toast.error(result.error);
      }
    }

    setIsSubmitting(false);
  };

  // Proceed with signup after email confirmation
  const handleConfirmSignup = async () => {
    setShowEmailConfirmDialog(false);
    setIsSubmitting(true);

    if (!pendingSignupData) {
      setIsSubmitting(false);
      return;
    }

    // Check if this hardware already has an account
    let hardwareId = null;
    if (window.electron?.getHardwareId) {
      hardwareId = await window.electron.getHardwareId();
    }
    if (hardwareId) {
      // First check if this hardware ID is associated with a deleted account
      const deletedCheck = await checkDeletedAccount(hardwareId);
      if (deletedCheck.isDeleted) {
        setAccountExistsError({ email: deletedCheck.email, isDeleted: true });
        setIsSubmitting(false);
        setPendingSignupData(null);
        return;
      }

      const hwCheck = await checkHardwareIdAccount(hardwareId);
      if (hwCheck.hasAccount) {
        setAccountExistsError({ email: hwCheck.email, isDeleted: false });
        setIsSubmitting(false);
        setPendingSignupData(null);
        return;
      }
    }

    // Pass hardware ID to register so it gets linked to the account
    const result = await register(
      pendingSignupData.email,
      pendingSignupData.password,
      pendingSignupData.displayName,
      hardwareId
    );
    if (result.user) {
      toast.success(t("account.success.registered"));
    } else if (result.error) {
      toast.error(result.error);
    }

    setIsSubmitting(false);
    setPendingSignupData(null);
  };

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      toast.success(t("account.success.loggedOut"));
    }
  };

  // Account deletion with hold-to-confirm
  const deleteHoldDuration = 3000; // 3 seconds
  const deleteIntervalRef = React.useRef(null);

  const handleDeleteMouseDown = () => {
    if (!deletePassword.trim()) {
      toast.error(t("account.deletion.passwordRequired") || "Please enter your password");
      return;
    }
    setIsHoldingDelete(true);
    const startTime = Date.now();

    deleteIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / deleteHoldDuration) * 100, 100);
      setDeleteHoldProgress(progress);

      if (progress >= 100) {
        clearInterval(deleteIntervalRef.current);
        setDeleteConfirmed(true);
        // Brief pause to show the confirmed state before deletion
        setTimeout(() => {
          handleAccountDeletion();
        }, 800);
      }
    }, 16);
  };

  const handleDeleteMouseUp = () => {
    setIsHoldingDelete(false);
    if (deleteIntervalRef.current) {
      clearInterval(deleteIntervalRef.current);
    }
    // Animate progress back to 0
    const currentProgress = deleteHoldProgress;
    const startTime = Date.now();
    const animateDown = () => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.max(
        currentProgress - (elapsed / 500) * currentProgress,
        0
      );
      setDeleteHoldProgress(newProgress);
      if (newProgress > 0) {
        requestAnimationFrame(animateDown);
      }
    };
    requestAnimationFrame(animateDown);
  };

  const handleAccountDeletion = async () => {
    setIsDeletingAccount(true);
    const result = await removeAccount(deletePassword);
    if (result.success) {
      toast.success(t("account.deletion.success") || "Account deleted successfully");
      setShowDeleteDialog(false);
      setDeletePassword("");
    } else {
      toast.error(
        result.error || t("account.deletion.failed") || "Failed to delete account"
      );
    }
    setIsDeletingAccount(false);
    setDeleteHoldProgress(0);
    setIsHoldingDelete(false);
    setDeleteConfirmed(false);
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setFormData({
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    });
    clearError();
  };

  const handleResendVerification = async () => {
    setIsResendingEmail(true);
    const result = await resendVerificationEmail();
    if (result.success) {
      toast.success(t("account.verification.emailSent"));
    } else {
      toast.error(result.error || t("account.verification.emailFailed"));
    }
    setIsResendingEmail(false);
  };

  // Webapp connection handlers
  const handleGenerateWebappCode = async () => {
    setIsGeneratingCode(true);
    try {
      // Get Firebase ID token directly from the user object
      const firebaseToken = await user.getIdToken();
      const response = await fetch("https://monitor.ascendara.app/generate-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firebaseToken}`,
        },
        body: JSON.stringify({
          userId: user.uid,
          displayName: userData?.displayName || user.displayName,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setWebappConnectionCode(data.code);

        // Generate QR code for the connection URL
        try {
          const qrResult = await window.electron.generateWebappQRCode(data.code);
          if (qrResult.success) {
            setWebappQRCode(qrResult.dataUrl);
          }
        } catch (error) {
          console.error("Error generating QR code:", error);
        }

        // Use the actual expiry time from the server (handles both new and existing codes)
        const expiryTime = data.expiresIn || 300;
        setWebappCodeExpiry(expiryTime);

        // Start countdown timer
        const countdownTimer = setInterval(() => {
          setWebappCodeExpiry(prev => {
            if (prev <= 1) {
              clearInterval(countdownTimer);
              clearInterval(statusPollTimer);
              setWebappConnectionCode(null);
              setWebappQRCode(null);
              setWebappCodeTimer(null);
              toast.error(t("ascend.settings.codeExpired") || "Connection code expired");
              return 300;
            }
            return prev - 1;
          });
        }, 1000);

        // Start polling for connection status
        const statusPollTimer = setInterval(async () => {
          try {
            const statusResponse = await fetch(
              `https://monitor.ascendara.app/connection-status/${data.code}`
            );
            const statusData = await statusResponse.json();

            if (statusData.success && statusData.status === "connected") {
              clearInterval(statusPollTimer);
              clearInterval(countdownTimer);
              setWebappConnectionCode(null);
              setWebappQRCode(null);
              setWebappCodeTimer(null);
              toast.success(
                t("ascend.settings.deviceConnected") || "Device connected successfully!"
              );

              // Reload connected devices list to show the new device
              loadConnectedDevices();
            }
          } catch (error) {
            console.error("Error checking connection status:", error);
          }
        }, 2000); // Poll every 2 seconds

        // Store both intervals together
        setWebappCodeTimer({ countdown: countdownTimer, statusPoll: statusPollTimer });

        // Show appropriate message based on whether it's a new or existing code
        if (data.existing) {
          toast.info(
            t("ascend.settings.existingCodeShown") ||
              "Showing your existing connection code"
          );
        } else {
          toast.success(
            t("ascend.settings.codeGenerated") || "Connection code generated"
          );
        }
      } else {
        toast.error(
          data.error ||
            t("ascend.settings.codeGenerationFailed") ||
            "Failed to generate code"
        );
      }
    } catch (error) {
      console.error("Error generating webapp code:", error);
      toast.error(t("ascend.settings.codeGenerationFailed") || "Failed to generate code");
    }
    setIsGeneratingCode(false);
  };

  const handleCopyWebappCode = () => {
    if (webappConnectionCode) {
      navigator.clipboard.writeText(webappConnectionCode);
      toast.success(t("ascend.settings.codeCopied") || "Code copied to clipboard");
      setWebappCodeCopied(true);
      setTimeout(() => {
        setWebappCodeCopied(false);
      }, 2000);
    }
  };

  const handleCancelWebappConnection = () => {
    if (webappCodeTimer) {
      if (typeof webappCodeTimer === "object") {
        clearInterval(webappCodeTimer.countdown);
        clearInterval(webappCodeTimer.statusPoll);
      } else {
        clearInterval(webappCodeTimer);
      }
      setWebappCodeTimer(null);
    }
    setWebappConnectionCode(null);
    setWebappQRCode(null);
    setWebappCodeExpiry(300);
  };

  // Load connected devices
  const loadConnectedDevices = async () => {
    if (!user || typeof user.getIdToken !== "function") return;

    setLoadingDevices(true);
    try {
      const firebaseToken = await user.getIdToken();
      const response = await fetch(
        `https://monitor.ascendara.app/connected-devices/${user.uid}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${firebaseToken}`,
          },
        }
      );

      const data = await response.json();
      if (data.success) {
        setConnectedDevices(data.devices || []);
      } else {
        toast.error(
          t("ascend.settings.failedToLoadDevices") || "Failed to load connected devices"
        );
      }
    } catch (error) {
      console.error("Error loading connected devices:", error);
      toast.error(
        t("ascend.settings.failedToLoadDevices") || "Failed to load connected devices"
      );
    }
    setLoadingDevices(false);
  };

  // Disconnect a device
  const handleDisconnectDevice = async sessionId => {
    if (!user || typeof user.getIdToken !== "function") return;

    setDisconnectingDevice(sessionId);
    try {
      const firebaseToken = await user.getIdToken();
      const response = await fetch("https://monitor.ascendara.app/disconnect-device", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firebaseToken}`,
        },
        body: JSON.stringify({
          sessionId,
          userId: user.uid,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(
          t("ascend.settings.deviceDisconnected") || "Device disconnected successfully"
        );
        // Reload devices list
        loadConnectedDevices();
      } else {
        toast.error(
          data.error ||
            t("ascend.settings.failedToDisconnect") ||
            "Failed to disconnect device"
        );
      }
    } catch (error) {
      console.error("Error disconnecting device:", error);
      toast.error(
        t("ascend.settings.failedToDisconnect") || "Failed to disconnect device"
      );
    }
    setDisconnectingDevice(null);
  };

  // Load connected devices when Companion is opened
  useEffect(() => {
    if (activeSection === "companion" && user) {
      loadConnectedDevices();
    }
  }, [activeSection]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (webappCodeTimer) {
        if (typeof webappCodeTimer === "object") {
          clearInterval(webappCodeTimer.countdown);
          clearInterval(webappCodeTimer.statusPoll);
        } else {
          clearInterval(webappCodeTimer);
        }
      }
    };
  }, [webappCodeTimer]);

  return {
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
  };
}
