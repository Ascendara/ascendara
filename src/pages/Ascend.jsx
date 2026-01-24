import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { checkForUpdates } from "@/services/updateCheckingService";
import {
  processNextInQueue,
  getDownloadQueue,
  removeFromQueue,
} from "@/services/downloadQueueService";
import {
  initializeDownloadSync,
  stopDownloadSync,
  checkDownloadCommands,
  acknowledgeCommand,
  forceSyncDownloads,
} from "@/services/downloadSyncService";
import { getDeviceIcon, getDeviceDescription } from "@/lib/deviceParser";
import { cn } from "@/lib/utils";
import {
  calculateLevelFromXP,
  getLevelConstants,
} from "@/services/levelCalculationService";
import { validateInput } from "@/services/profanityFilterService";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import AscendSidebar from "@/components/AscendSidebar";
import LevelingCard from "@/components/LevelingCard";
import CommunityHub from "@/components/CommunityHub";
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
  getMessages,
  markMessagesAsRead,
  cleanupAllOldMessages,
  syncProfileToAscend,
  getProfileStats,
  checkHardwareIdAccount,
  checkDeletedAccount,
  deleteNewAccount,
  registerHardwareId,
  syncCloudLibrary,
  getCloudLibrary,
  syncGameAchievements,
  getGameAchievements,
  getAllGameAchievements,
  deleteCloudGame,
  getUserPublicProfile,
  getNotifications,
  uploadBackup,
  listBackups,
  getBackupDownloadUrl,
  deleteBackup,
  subscribeToMessages,
  subscribeToConversations,
  manageMessageListeners,
  cleanupMessageListeners,
} from "@/services/firebaseService";
import {
  User,
  Users,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Circle,
  Moon,
  Loader2,
  ArrowRight,
  Sparkles,
  Shield,
  Cloud,
  CloudUpload,
  Zap,
  LogOut,
  Settings,
  ChevronRight,
  AlertTriangle,
  Search,
  MessageCircle,
  UserPlus,
  Bell,
  Check,
  X,
  UserMinus,
  Clock,
  Pencil,
  Camera,
  Save,
  Send,
  ArrowLeft,
  Gamepad2,
  Trophy,
  RefreshCw,
  CloudIcon,
  Gift,
  Play,
  Star,
  Trash2,
  ChevronDown,
  ChevronUp,
  Award,
  LockIcon,
  ExternalLink,
  MoreVertical,
  Info,
  Globe,
  Github,
  RotateCcw,
  Link2,
  Sparkle,
  CreditCard,
  Calendar,
  Crown,
  BadgeCheck,
  CloudOff,
  Flag,
  Loader,
  Hammer,
  Heart,
  BadgeDollarSign,
  UserCheck,
  Inbox,
  Download,
  ListOrdered,
  Puzzle,
  Infinity,
  Copy,
  Smartphone,
  Laptop,
  Monitor,
  CheckCheck,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

// Google Icon SVG Component
const GoogleIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

// Helper function to get auth token for API calls
const getAuthToken = async () => {
  const AUTHORIZATION = await window.electron.getAPIKey();
  const response = await fetch("https://api.ascendara.app/auth/token", {
    headers: { Authorization: AUTHORIZATION },
  });
  if (!response.ok) throw new Error("Failed to obtain token");
  const { token } = await response.json();
  return token;
};

const Ascend = () => {
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
    const checkVersion = async () => {
      try {
        const isLatest = await checkForUpdates();
        setIsOutdated(!isLatest);
      } catch (error) {
        console.error("Error checking version:", error);
        setIsOutdated(false);
      }
      setCheckingVersion(false);
    };
    checkVersion();
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
      messagesEndRef.current.scrollIntoView({ behavior });
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

      if (playtimeSeconds > 0) {
        gamesPlayedCount += 1;
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
      totalPlaytime += playtimeSeconds;
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

  // Load local stats from Electron
  const loadLocalStats = async () => {
    setLoadingLocalStats(true);
    try {
      const games = (await window.electron?.getGames?.()) || [];
      const customGames = (await window.electron?.getCustomGames?.()) || [];
      console.log("[Ascend] Loaded games:", games.length + customGames.length, "games");
      const stats = calculateProfileStats(games, customGames);
      console.log("[Ascend] Calculated stats:", {
        totalGames: stats.totalGames,
        gamesPlayed: stats.gamesPlayed,
        xp: stats.xp,
        level: stats.level,
        totalPlaytime: stats.totalPlaytime,
      });

      setLocalStats({
        level: stats.level,
        xp: stats.xp,
        currentXP: stats.currentXP,
        nextLevelXp: stats.nextLevelXp,
        totalPlaytime: stats.totalPlaytime,
        gamesPlayed: stats.gamesPlayed,
        totalGames: stats.totalGames,
      });

      // Get recent games sorted by playtime
      const allGames = [...games, ...customGames];
      const sortedGames = allGames
        .filter(g => g.playTime && g.playTime >= 60)
        .sort((a, b) => (b.playTime || 0) - (a.playTime || 0))
        .slice(0, 4);
      setRecentGames(sortedGames);

      // Load game images
      const images = {};
      for (const game of sortedGames) {
        try {
          const gameId = game.game || game.name;
          const localStorageKey = `game-cover-${gameId}`;
          const cachedImage = localStorage.getItem(localStorageKey);
          if (cachedImage) {
            images[gameId] = cachedImage;
          } else {
            const imageBase64 = await window.electron.getGameImage(gameId);
            if (imageBase64) {
              const dataUrl = `data:image/jpeg;base64,${imageBase64}`;
              images[gameId] = dataUrl;
              try {
                localStorage.setItem(localStorageKey, dataUrl);
              } catch (e) {
                console.warn("Could not cache game image:", e);
              }
            }
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
      // Get local profile data from Electron
      const joinDate = (await window.electron?.timestampTime?.()) || null;
      const games = (await window.electron?.getGames?.()) || [];
      const customGames = (await window.electron?.getCustomGames?.()) || [];

      // Use centralized calculation
      const stats = calculateProfileStats(games, customGames);

      const profileData = {
        level: stats.level,
        xp: stats.xp,
        totalPlaytime: stats.totalPlaytime,
        gamesPlayed: stats.gamesPlayed,
        totalGames: stats.totalGames,
        joinDate,
      };

      const result = await syncProfileToAscend(profileData);
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
      const AUTHORIZATION = await window.electron.getAPIKey();
      const userId = user?.uid || "";
      const response = await fetch(
        `https://api.ascendara.app/ascend/leaderboard${userId ? `?userId=${userId}` : ""}`,
        {
          headers: { Authorization: AUTHORIZATION },
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
      const response = await fetch("https://api.ascendara.app/json/changelog");
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

      // First, load images for local games
      for (const game of allLocalGames.slice(0, 20)) {
        // Limit to first 20 for performance
        try {
          const gameId = game.game || game.name;
          const localStorageKey = `game-cover-${gameId}`;
          const cachedImage = localStorage.getItem(localStorageKey);
          if (cachedImage) {
            images[gameId] = cachedImage;
          } else {
            const imageBase64 = await window.electron.getGameImage(gameId);
            if (imageBase64) {
              const dataUrl = `data:image/jpeg;base64,${imageBase64}`;
              images[gameId] = dataUrl;
              try {
                localStorage.setItem(localStorageKey, dataUrl);
              } catch (e) {
                console.warn("Could not cache game image:", e);
              }
            }
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
          // Limit for performance
          try {
            const localStorageKey = `game-cover-${game.name}`;
            const cachedImage = localStorage.getItem(localStorageKey);
            if (cachedImage) {
              images[game.name] = cachedImage;
            } else {
              // Fetch image from API using gameID
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
                try {
                  localStorage.setItem(localStorageKey, dataUrl);
                } catch (e) {
                  console.warn("Could not cache cloud game image:", e);
                }
              }
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
      const buffer = Buffer.from(arrayBuffer);

      // Save to temp location
      const tempPath = await window.electron.getTempPath();
      const backupFilePath = `${tempPath}/${backupName}.zip`;
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
        messagesEndRef.current.scrollIntoView({ behavior: "instant" });
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
      loadRequestsData();
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
      const AUTHORIZATION = await window.electron.getAPIKey();
      const response = await fetch("https://api.ascendara.app/auth/token", {
        headers: {
          Authorization: AUTHORIZATION,
        },
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
          const newTokenResponse = await fetch("https://api.ascendara.app/auth/token", {
            headers: {
              Authorization: AUTHORIZATION,
            },
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
      loadFriendsData();
      loadRequestsData();
    } else {
      toast.error(result.error);
    }
  };

  const handleDenyRequest = async requestId => {
    const result = await denyFriendRequest(requestId);
    if (result.success) {
      toast.success(t("ascend.friends.requestDenied"));
      loadRequestsData();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemoveFriend = async friendUid => {
    const result = await removeFriend(friendUid);
    if (result.success) {
      toast.success(t("ascend.friends.removed"));
      loadFriendsData();
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

      // Verify the user account still exists in Firebase
      try {
        const authToken = await getAuthToken();
        if (!authToken) {
          toast.error(
            t("account.errors.authenticationFailed") ||
              "Authentication failed. Please log in again."
          );
          await handleLogout();
          return;
        }
      } catch (authError) {
        console.error("Authentication error:", authError);
        toast.error(
          t("account.errors.accountNotFound") || "Account not found. Please log in again."
        );
        await handleLogout();
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

      // Filter and organize plans (1 month, 3 month, 6 month)
      // Exclude the duplicate price_1ScUAMCfu5zjwIKZd4FezEnW
      const plans =
        product.prices
          ?.filter(
            price =>
              price.interval === "month" && price.id !== "price_1ScUAMCfu5zjwIKZd4FezEnW"
          )
          .map(price => ({
            id: price.id,
            intervalCount: price.intervalCount,
            unitAmount: price.unitAmount,
            currency: price.currency,
          }))
          .sort((a, b) => a.intervalCount - b.intervalCount) || [];

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

      const authToken = await getAuthToken();
      const response = await fetch(
        "https://api.ascendara.app/stripe/create-checkout-session",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            userId: user.uid,
            priceId: priceId,
            successUrl: "ascendara://checkout-success?session_id={CHECKOUT_SESSION_ID}",
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
      const authToken = await getAuthToken();
      const response = await fetch("https://api.ascendara.app/stripe/customer-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          userId: user.uid,
          returnUrl: "ascendara://checkout-canceled",
        }),
      });
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
      const authToken = await getAuthToken();
      const response = await fetch("https://api.ascendara.app/stripe/customer-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          userId: user.uid,
          returnUrl: "ascendara://checkout-canceled",
        }),
      });
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

  // Handle checkout success callback from protocol
  const handleCheckoutSuccess = async sessionId => {
    try {
      // User might not be loaded yet when protocol callback fires
      if (!user?.uid) {
        console.log("User not loaded yet, waiting...");
        // Wait a bit for user to load and retry
        setTimeout(() => handleCheckoutSuccess(sessionId), 1000);
        return;
      }

      const authToken = await getAuthToken();
      const response = await fetch("https://api.ascendara.app/stripe/verify-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          sessionId: sessionId,
          userId: user.uid,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Backend updates Firestore directly via Admin SDK
          setShowSubscriptionSuccess(true);
          // Refresh access status
          verifyAccess();
        } else {
          toast.error(data.message || t("ascend.settings.paymentNotCompleted"));
        }
      } else {
        toast.error(t("ascend.settings.verifyCheckoutError"));
      }
    } catch (error) {
      console.error("Error verifying checkout:", error);
      toast.error(t("ascend.settings.verifyCheckoutError"));
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
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
      if (!passwordRegex.test(formData.password)) {
        toast.error(t("account.errors.passwordRequirements"));
        setIsSubmitting(false);
        return;
      }
      if (!agreedToTerms) {
        toast.error(t("account.errors.termsRequired"));
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

  // Load connected devices when settings section is opened
  useEffect(() => {
    if (activeSection === "settings" && user) {
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

  if (authLoading) {
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
          <p className="text-sm text-muted-foreground">{t("account.loading")}</p>
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
                onClick={handleDisplayNameSubmit}
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
            <AlertDialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
              <AlertDialogContent className="max-w-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-2xl">
                    <Crown className="h-6 w-6 text-primary" />
                    {t("ascend.settings.subscriptionDialog.title")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("ascend.settings.subscriptionDialog.description")}
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="grid gap-4 py-4 sm:grid-cols-3">
                  {availablePlans.map(plan => {
                    const isMonthly = plan.intervalCount === 1;
                    const is3Month = plan.intervalCount === 3;
                    const is6Month = plan.intervalCount === 6;
                    const totalPrice = plan.unitAmount / 100;
                    const pricePerMonth = (totalPrice / plan.intervalCount).toFixed(2);
                    const savings = is3Month ? "17%" : is6Month ? "25%" : null;

                    return (
                      <motion.div
                        key={plan.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`relative flex cursor-pointer flex-col rounded-xl border-2 transition-all hover:scale-105 hover:shadow-lg ${
                          is6Month
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:border-primary/50"
                        }`}
                        onClick={() => handlePlanSelection(plan.id)}
                      >
                        {savings && (
                          <div className="absolute -right-2 -top-2 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-secondary shadow-lg">
                            {t("ascend.settings.subscriptionDialog.saveText")} {savings}
                          </div>
                        )}

                        <div className="flex-1 space-y-3 p-4">
                          <div className="text-center">
                            <h3 className="text-lg font-bold">
                              {plan.intervalCount}{" "}
                              {plan.intervalCount > 1
                                ? t("ascend.settings.subscriptionDialog.months")
                                : t("ascend.settings.subscriptionDialog.month")}
                            </h3>
                            {is6Month && (
                              <p className="text-xs font-semibold text-primary">
                                {t("ascend.settings.subscriptionDialog.bestValue")}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1 text-center">
                            <div className="flex items-baseline justify-center gap-1">
                              <span className="text-3xl font-bold">${totalPrice}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {plan.intervalCount > 1
                                ? `$${pricePerMonth}${t("ascend.settings.subscriptionDialog.perMonth")} - ${t("ascend.settings.subscriptionDialog.billedEvery", { count: plan.intervalCount })}`
                                : t("ascend.settings.subscriptionDialog.billedMonthly")}
                            </p>
                          </div>

                          <div className="space-y-2 text-center">
                            <div className="text-xs text-muted-foreground">
                              {t("ascend.settings.subscriptionDialog.allPlansInclude")}
                            </div>
                            {savings && (
                              <div className="flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 font-bold text-primary">
                                <Sparkles className="h-4 w-4" />
                                <span className="text-sm">
                                  {t("ascend.settings.subscriptionDialog.save", {
                                    percent: savings,
                                  })}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div
                          className={`rounded-b-xl border-t py-3 text-center text-sm font-semibold ${
                            is6Month
                              ? "border-primary/20 bg-primary text-secondary"
                              : "border-border bg-muted text-foreground"
                          }`}
                        >
                          {t("ascend.settings.subscriptionDialog.selectPlan")}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel>
                    {t("ascend.settings.subscriptionDialog.cancel")}
                  </AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
                  : t("ascend.access.expired")}
              </h1>
              <p className="text-muted-foreground">
                {isTrialBlocked
                  ? t("ascend.access.trialBlockedMessage")
                  : t("ascend.access.expiredMessage")}
              </p>
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
          <AlertDialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
            <AlertDialogContent className="max-w-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-2xl">
                  <Crown className="h-6 w-6 text-primary" />
                  {t("ascend.settings.subscriptionDialog.title")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("ascend.settings.subscriptionDialog.description")}
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="grid gap-4 py-4 sm:grid-cols-3">
                {availablePlans.map(plan => {
                  const isMonthly = plan.intervalCount === 1;
                  const is3Month = plan.intervalCount === 3;
                  const is6Month = plan.intervalCount === 6;
                  const totalPrice = plan.unitAmount / 100;
                  const pricePerMonth = (totalPrice / plan.intervalCount).toFixed(2);
                  const savings = is3Month ? "17%" : is6Month ? "25%" : null;

                  return (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`relative flex cursor-pointer flex-col rounded-xl border-2 transition-all hover:scale-105 hover:shadow-lg ${
                        is6Month
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/50"
                      }`}
                      onClick={() => handlePlanSelection(plan.id)}
                    >
                      {savings && (
                        <div className="absolute -right-2 -top-2 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-secondary shadow-lg">
                          {t("ascend.settings.subscriptionDialog.saveText")} {savings}
                        </div>
                      )}

                      <div className="flex-1 space-y-3 p-4">
                        <div className="text-center">
                          <h3 className="text-lg font-bold">
                            {plan.intervalCount}{" "}
                            {plan.intervalCount > 1
                              ? t("ascend.settings.subscriptionDialog.months")
                              : t("ascend.settings.subscriptionDialog.month")}
                          </h3>
                          {is6Month && (
                            <p className="text-xs font-semibold text-primary">
                              {t("ascend.settings.subscriptionDialog.bestValue")}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1 text-center">
                          <div className="flex items-baseline justify-center gap-1">
                            <span className="text-3xl font-bold">${totalPrice}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {plan.intervalCount > 1
                              ? `$${pricePerMonth}${t("ascend.settings.subscriptionDialog.perMonth")} - ${t("ascend.settings.subscriptionDialog.billedEvery", { count: plan.intervalCount })}`
                              : t("ascend.settings.subscriptionDialog.billedMonthly")}
                          </p>
                        </div>

                        <div className="space-y-2 text-center">
                          <div className="text-xs text-muted-foreground">
                            {t("ascend.settings.subscriptionDialog.allPlansInclude")}
                          </div>
                          {savings && (
                            <div className="flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 font-bold text-primary">
                              <Sparkles className="h-4 w-4" />
                              <span className="text-sm">
                                {t("ascend.settings.subscriptionDialog.save", {
                                  percent: savings,
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        className={`rounded-b-xl border-t py-3 text-center text-sm font-semibold ${
                          is6Month
                            ? "border-primary/20 bg-primary text-secondary"
                            : "border-border bg-muted text-foreground"
                        }`}
                      >
                        {t("ascend.settings.subscriptionDialog.selectPlan")}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t("ascend.settings.subscriptionDialog.cancel")}
                </AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
            <div className="space-y-6">
              {/* Hero Welcome Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 md:p-8"
              >
                {/* Decorative elements */}
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-primary/5 blur-2xl" />

                <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
                  {/* Profile Avatar */}
                  <div className="relative shrink-0">
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                      className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary via-primary/90 to-primary/70 shadow-xl shadow-primary/20 ring-4 ring-background md:h-28 md:w-28"
                    >
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-primary-foreground text-4xl font-bold">
                          {(user.displayName || user.email || "U")[0].toUpperCase()}
                        </span>
                      )}
                    </motion.div>
                    <div
                      className={`border-3 absolute bottom-1 right-1 h-5 w-5 rounded-full border-background shadow-lg ${
                        userStatus === "online"
                          ? "bg-green-500"
                          : userStatus === "away"
                            ? "bg-yellow-500"
                            : userStatus === "busy"
                              ? "bg-red-500"
                              : "bg-gray-500"
                      }`}
                    />
                  </div>

                  {/* Welcome Text */}
                  <div className="flex-1 space-y-2">
                    <motion.h1
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                      className="flex items-center gap-2 text-3xl font-bold tracking-tight md:text-4xl"
                    >
                      {t("ascend.welcome", {
                        name: user.displayName || t("account.welcome"),
                      })}
                    </motion.h1>
                    <motion.p
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-muted-foreground"
                    >
                      {t("ascend.homeSubtitle")}
                    </motion.p>

                    {/* Quick Action Buttons */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="flex flex-wrap gap-2 pt-2"
                    >
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setActiveSection("friends")}
                        className="gap-2"
                      >
                        <Users className="h-4 w-4" />
                        {t("ascend.nav.friends")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveSection("messages")}
                        className="gap-2"
                      >
                        <MessageCircle className="h-4 w-4" />
                        {t("ascend.nav.messages")}
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </motion.div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  onClick={() => setActiveSection("friends")}
                  className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-5 text-left transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-primary/10 blur-xl transition-all group-hover:bg-primary/20" />
                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Users className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-3xl font-bold">{friends.length}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("ascend.stats.friends")}
                    </p>
                  </div>
                </motion.button>

                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  onClick={() => setActiveSection("requests")}
                  className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-5 text-left transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-amber-500/10 blur-xl transition-all group-hover:bg-amber-500/20" />
                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                      <UserPlus className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-3xl font-bold">{incomingRequests.length}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("ascend.stats.requests")}
                    </p>
                  </div>
                </motion.button>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-5 text-left"
                >
                  <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-emerald-500/10 blur-xl" />
                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Gamepad2 className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-3xl font-bold">{localStats.totalGames}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("ascend.profile.games")}
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-5 text-left"
                >
                  <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-violet-500/10 blur-xl" />
                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                      <Clock className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-3xl font-bold">
                      {formatPlaytime(localStats.totalPlaytime)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("ascend.stats.playtime")}
                    </p>
                  </div>
                </motion.div>
              </div>

              {/* Level Progress Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {loadingLocalStats ? (
                  <div className="flex items-center justify-center rounded-xl border border-border/50 bg-card/50 p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <LevelingCard
                    level={localStats.level}
                    currentXP={localStats.currentXP}
                    nextLevelXp={localStats.nextLevelXp}
                    totalXP={localStats.xp}
                  />
                )}
              </motion.div>

              {/* Recent Games Section */}
              {recentGames.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">
                      {t("profile.topGames") || "Top Games"}
                    </h2>
                    <span className="text-sm text-muted-foreground">
                      {localStats.gamesPlayed} {t("profile.gamesPlayed") || "played"}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {recentGames.map((game, index) => {
                      const gameId = game.game || game.name;
                      return (
                        <motion.div
                          key={gameId}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 + index * 0.05 }}
                          className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-4 transition-all hover:bg-card hover:shadow-md"
                        >
                          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg shadow-md">
                            {gameImages[gameId] ? (
                              <img
                                src={gameImages[gameId]}
                                alt={gameId}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-muted">
                                <Gamepad2 className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-medium">{gameId}</h3>
                            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{formatPlaytimeDetailed(game.playTime || 0)}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-medium text-primary">
                              #{index + 1}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Cloud Sync Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
              >
                {loadingProfileStats ? (
                  <div className="flex items-center justify-center rounded-xl border border-border/50 bg-card/50 p-6">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : profileStats ? (
                  <div className="mb-40 rounded-xl border border-border/50 bg-gradient-to-br from-card/80 to-card/50 p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Cloud className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h2 className="font-semibold">{t("ascend.profile.stats")}</h2>
                          <p className="text-xs text-muted-foreground">
                            {t("ascend.profile.cloudSynced") || "Synced to cloud"}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSyncProfile}
                        disabled={isSyncingProfile}
                        className="gap-2"
                      >
                        {isSyncingProfile ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        {t("ascend.profile.resync")}
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-border/30 bg-muted/30 p-4 text-center">
                        <Trophy className="mx-auto h-5 w-5 text-amber-500" />
                        <p className="mt-2 text-2xl font-bold">{profileStats.level}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("ascend.profile.level")}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/30 bg-muted/30 p-4 text-center">
                        <Zap className="mx-auto h-5 w-5 text-yellow-500" />
                        <p className="mt-2 text-2xl font-bold">
                          {profileStats.xp?.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("ascend.profile.xp")}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/30 bg-muted/30 p-4 text-center">
                        <Gamepad2 className="mx-auto h-5 w-5 text-emerald-500" />
                        <p className="mt-2 text-2xl font-bold">
                          {profileStats.totalGames}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("ascend.profile.games")}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/30 bg-muted/30 p-4 text-center">
                        <Clock className="mx-auto h-5 w-5 text-violet-500" />
                        <p className="mt-2 text-2xl font-bold">
                          {formatPlaytime(profileStats.totalPlaytime)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("ascend.profile.playtime")}
                        </p>
                      </div>
                    </div>
                    {profileStats.lastSynced && (
                      <p className="mt-4 text-center text-xs text-muted-foreground">
                        {t("ascend.profile.lastSynced", {
                          date: new Date(profileStats.lastSynced).toLocaleDateString(),
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="relative mb-40 overflow-hidden rounded-xl border border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-8 text-center">
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
                    <div className="relative">
                      <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring" }}
                        className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
                      >
                        <CloudUpload className="h-8 w-8 text-primary" />
                      </motion.div>
                      <h2 className="text-lg font-semibold">
                        {t("ascend.profile.syncTitle")}
                      </h2>
                      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        {t("ascend.profile.syncDescription")}
                      </p>
                      <Button
                        onClick={handleSyncProfile}
                        className="mt-4 gap-2 text-secondary"
                        disabled={isSyncingProfile}
                      >
                        {isSyncingProfile ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CloudUpload className="h-4 w-4" />
                        )}
                        {t("ascend.profile.syncButton")}
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          );

        case "search":
          return (
            <div className="mb-20 space-y-6">
              <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card/95 to-card/90 p-6">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl" />
                <div className="relative">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 backdrop-blur-sm">
                      <Search className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold">{t("ascend.search.title")}</h1>
                      <p className="text-sm text-muted-foreground">
                        {t("ascend.search.subtitle") ||
                          "Find and connect with other players"}
                      </p>
                    </div>
                  </div>

                  {/* Search Form */}
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      handleSearch();
                    }}
                    className="flex gap-3"
                  >
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={t("ascend.search.placeholder")}
                        className="h-12 rounded-xl border-border/50 bg-background/50 pl-12 text-base"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isSearching || !searchQuery.trim()}
                      className="h-12 rounded-xl px-6 text-secondary"
                    >
                      {isSearching ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <Search className="mr-2 h-4 w-4" />
                          {t("ascend.search.search")}
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 ? (
                <div className="space-y-3">
                  <p className="px-1 text-sm text-muted-foreground">
                    {t("ascend.search.resultsCount", { count: searchResults.length }) ||
                      `${searchResults.length} users found`}
                  </p>
                  {searchResults.map((result, index) => (
                    <motion.div
                      key={result.uid}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-all duration-300 hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                    >
                      {/* Background glow on hover */}
                      <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/5 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />

                      <div
                        onClick={() => handleViewProfile(result.uid)}
                        className="w-full cursor-pointer p-5 text-left"
                      >
                        <div className="relative flex items-start gap-4">
                          {/* Avatar with status */}
                          <div className="relative shrink-0">
                            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 shadow-lg shadow-primary/20">
                              {result.photoURL ? (
                                <img
                                  src={result.photoURL}
                                  alt={result.displayName}
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-primary-foreground text-xl font-bold">
                                  {result.displayName?.[0]?.toUpperCase() || "U"}
                                </span>
                              )}
                            </div>
                            <div
                              className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-card shadow-sm ${
                                result.status === "online"
                                  ? "bg-green-500"
                                  : result.status === "away"
                                    ? "bg-yellow-500"
                                    : result.status === "busy"
                                      ? "bg-red-500"
                                      : "bg-gray-500"
                              }`}
                            />
                          </div>

                          {/* User Info */}
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <h3 className="truncate text-lg font-semibold">
                                {result.displayName}
                              </h3>
                              {result.owner && (
                                <Crown className="h-5 w-5 shrink-0 text-yellow-500" />
                              )}
                              {result.contributor && (
                                <Hammer className="h-5 w-5 shrink-0 text-orange-500" />
                              )}
                              {result.verified && (
                                <BadgeCheck className="h-5 w-5 shrink-0 text-blue-500" />
                              )}
                              {!result.private && result.level > 1 && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  Lv. {result.level}
                                </span>
                              )}
                              {result.private && (
                                <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-400">
                                  <LockIcon className="h-3 w-3" />
                                  {t("ascend.profile.private") || "Private"}
                                </span>
                              )}
                            </div>

                            {/* Bio */}
                            {!result.private && result.bio && (
                              <p className="mb-2 line-clamp-1 text-sm text-muted-foreground">
                                {result.bio}
                              </p>
                            )}

                            {/* Stats Row */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <div
                                  className={`h-2 w-2 rounded-full ${
                                    result.status === "online"
                                      ? "bg-green-500"
                                      : result.status === "away"
                                        ? "bg-yellow-500"
                                        : result.status === "busy"
                                          ? "bg-red-500"
                                          : "bg-gray-500"
                                  }`}
                                />
                                <span className="capitalize">
                                  {result.status === "online"
                                    ? t("ascend.status.online")
                                    : result.status === "away"
                                      ? t("ascend.status.away")
                                      : result.status === "busy"
                                        ? t("ascend.status.busy")
                                        : t("ascend.status.offline")}
                                </span>
                              </div>
                              {!result.private && result.totalPlaytime > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>
                                    {Math.floor(result.totalPlaytime / 3600)}h played
                                  </span>
                                </div>
                              )}
                              {!result.private && result.gamesPlayed > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Gamepad2 className="h-3.5 w-3.5" />
                                  <span>{result.gamesPlayed} games</span>
                                </div>
                              )}
                              {!result.private && result.country && (
                                <div className="flex items-center gap-1.5">
                                  <Globe className="h-3.5 w-3.5" />
                                  <span>{result.country}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex shrink-0 items-center gap-2">
                            {(() => {
                              const status = getRelationshipStatus(result.uid);
                              if (status === "friend") {
                                return (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-xl opacity-0 transition-opacity group-hover:opacity-100"
                                    disabled
                                  >
                                    <UserCheck className="mr-2 h-4 w-4 text-green-500" />
                                    {t("ascend.friends.friends") || "Friends"}
                                  </Button>
                                );
                              } else if (status === "requestSent") {
                                return (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-xl opacity-0 transition-opacity group-hover:opacity-100"
                                    disabled
                                  >
                                    <Clock className="mr-2 h-4 w-4 text-amber-500" />
                                    {t("ascend.friends.requestPending") || "Pending"}
                                  </Button>
                                );
                              } else if (status === "requestReceived") {
                                return (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-xl opacity-0 transition-opacity group-hover:opacity-100"
                                    disabled
                                  >
                                    <Inbox className="mr-2 h-4 w-4 text-blue-500" />
                                    {t("ascend.friends.requestReceived") ||
                                      "Request Received"}
                                  </Button>
                                );
                              } else {
                                return (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-xl opacity-0 transition-opacity group-hover:opacity-100"
                                    onClick={e => {
                                      e.stopPropagation();
                                      handleSendRequest(result.uid);
                                    }}
                                  >
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    {t("ascend.friends.addFriend")}
                                  </Button>
                                );
                              }
                            })()}
                            <ChevronRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : searchQuery && !isSearching ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl border border-border/50 bg-card/50 p-12 text-center"
                >
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                    <Search className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="mb-1 text-lg font-semibold">
                    {t("ascend.search.noResultsTitle") || "No users found"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("ascend.search.noResults")}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-12 text-center"
                >
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/10 to-violet-500/10">
                    <Users className="h-10 w-10 text-primary/50" />
                  </div>
                  <h3 className="mb-1 text-lg font-semibold">
                    {t("ascend.search.startSearching") || "Start searching"}
                  </h3>
                  <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    {t("ascend.search.hint")}
                  </p>
                </motion.div>
              )}
            </div>
          );

        case "friends":
          const onlineFriends = friends.filter(f => f.status === "online");
          const awayFriends = friends.filter(f => f.status === "away");
          const busyFriends = friends.filter(f => f.status === "busy");
          const offlineFriends = friends.filter(
            f => !["online", "away", "busy"].includes(f.status)
          );

          return (
            <div className="space-y-6">
              {/* Header with title and add friend button */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold">{t("ascend.friends.title")}</h1>
                  <p className="text-sm text-muted-foreground">
                    {t("ascend.friends.subtitle") || "Connect and play with your friends"}
                  </p>
                </div>
                <Button
                  onClick={() => setActiveSection("search")}
                  className="gap-2 text-secondary"
                >
                  <UserPlus className="h-4 w-4" />
                  {t("ascend.friends.addFriend")}
                </Button>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{friends.length}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("ascend.friends.totalFriends") || "Total Friends"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                      <Circle className="h-5 w-5 fill-green-500 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{onlineFriends.length}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("ascend.friends.online") || "Online"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
                      <Moon className="h-5 w-5 text-yellow-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{awayFriends.length}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("ascend.friends.away") || "Away"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-500/10">
                      <EyeOff className="h-5 w-5 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{offlineFriends.length}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("ascend.friends.offline") || "Offline"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {loadingFriends ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : friends.length > 0 ? (
                <div className="space-y-4">
                  {/* Online Friends Section */}
                  {onlineFriends.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <h3 className="text-sm font-medium text-muted-foreground">
                          {t("ascend.friends.onlineNow") || "Online Now"} (
                          {onlineFriends.length})
                        </h3>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {onlineFriends.map(friend => (
                          <motion.div
                            key={friend.uid}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="group relative overflow-hidden rounded-xl border border-green-500/20 bg-gradient-to-r from-green-500/5 to-transparent p-4 transition-all hover:border-green-500/40 hover:shadow-lg hover:shadow-green-500/5"
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleViewProfile(friend.uid, "friends")}
                                className="relative shrink-0"
                              >
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 ring-2 ring-green-500/30 transition-all group-hover:ring-green-500/50">
                                  {friend.photoURL ? (
                                    <img
                                      src={friend.photoURL}
                                      alt={friend.displayName}
                                      className="h-full w-full rounded-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <span className="text-primary-foreground text-lg font-bold">
                                      {friend.displayName?.[0]?.toUpperCase() || "U"}
                                    </span>
                                  )}
                                </div>
                                <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card bg-green-500" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <button
                                  onClick={() => handleViewProfile(friend.uid, "friends")}
                                  className="block text-left"
                                >
                                  <p className="flex items-center gap-1 truncate font-semibold transition-colors hover:text-primary">
                                    {friend.displayName}
                                    {friend.owner && (
                                      <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                                    )}
                                    {friend.contributor && (
                                      <Hammer className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                                    )}
                                    {friend.verified && (
                                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                                    )}
                                  </p>
                                </button>
                                <p className="truncate text-xs text-green-600 dark:text-green-400">
                                  {friend.customMessage || t("ascend.status.online")}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => handleViewProfile(friend.uid, "friends")}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => handleStartConversation(friend.uid)}
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="hover:text-destructive h-8 w-8 text-muted-foreground"
                                  onClick={() => handleRemoveFriend(friend.uid)}
                                >
                                  <UserMinus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Away/Busy Friends Section */}
                  {(awayFriends.length > 0 || busyFriends.length > 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <div className="h-2 w-2 rounded-full bg-yellow-500" />
                        <h3 className="text-sm font-medium text-muted-foreground">
                          {t("ascend.friends.awayOrBusy") || "Away / Busy"} (
                          {awayFriends.length + busyFriends.length})
                        </h3>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {[...awayFriends, ...busyFriends].map(friend => (
                          <motion.div
                            key={friend.uid}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="group relative overflow-hidden rounded-xl border border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-transparent p-4 transition-all hover:border-yellow-500/40 hover:shadow-lg hover:shadow-yellow-500/5"
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleViewProfile(friend.uid, "friends")}
                                className="relative shrink-0"
                              >
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 ring-2 ring-yellow-500/30 transition-all group-hover:ring-yellow-500/50">
                                  {friend.photoURL ? (
                                    <img
                                      src={friend.photoURL}
                                      alt={friend.displayName}
                                      className="h-full w-full rounded-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <span className="text-primary-foreground text-lg font-bold">
                                      {friend.displayName?.[0]?.toUpperCase() || "U"}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${friend.status === "busy" ? "bg-red-500" : "bg-yellow-500"}`}
                                />
                              </button>
                              <div className="min-w-0 flex-1">
                                <button
                                  onClick={() => handleViewProfile(friend.uid, "friends")}
                                  className="block text-left"
                                >
                                  <p className="flex items-center gap-1 truncate font-semibold transition-colors hover:text-primary">
                                    {friend.displayName}
                                    {friend.owner && (
                                      <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                                    )}
                                    {friend.contributor && (
                                      <Hammer className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                                    )}
                                    {friend.verified && (
                                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                                    )}
                                  </p>
                                </button>
                                <p className="truncate text-xs text-yellow-600 dark:text-yellow-400">
                                  {friend.customMessage ||
                                    (friend.status === "busy"
                                      ? t("ascend.status.busy")
                                      : t("ascend.status.away"))}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => handleViewProfile(friend.uid, "friends")}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => handleStartConversation(friend.uid)}
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="hover:text-destructive h-8 w-8 text-muted-foreground"
                                  onClick={() => handleRemoveFriend(friend.uid)}
                                >
                                  <UserMinus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Offline Friends Section */}
                  {offlineFriends.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <div className="h-2 w-2 rounded-full bg-gray-500" />
                        <h3 className="text-sm font-medium text-muted-foreground">
                          {t("ascend.friends.offlineSection") || "Offline"} (
                          {offlineFriends.length})
                        </h3>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {offlineFriends.map(friend => (
                          <motion.div
                            key={friend.uid}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/30 p-4 transition-all hover:border-border hover:bg-card/50"
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleViewProfile(friend.uid, "friends")}
                                className="relative shrink-0"
                              >
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted/70 opacity-75 transition-all group-hover:opacity-100">
                                  {friend.photoURL ? (
                                    <img
                                      src={friend.photoURL}
                                      alt={friend.displayName}
                                      className="h-full w-full rounded-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <span className="text-lg font-bold text-muted-foreground">
                                      {friend.displayName?.[0]?.toUpperCase() || "U"}
                                    </span>
                                  )}
                                </div>
                                <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card bg-gray-500" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <button
                                  onClick={() => handleViewProfile(friend.uid, "friends")}
                                  className="block text-left"
                                >
                                  <p className="flex items-center gap-1 truncate font-semibold text-muted-foreground transition-colors hover:text-foreground">
                                    {friend.displayName}
                                    {friend.owner && (
                                      <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                                    )}
                                    {friend.contributor && (
                                      <Hammer className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                                    )}
                                    {friend.verified && (
                                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                                    )}
                                  </p>
                                </button>
                                <p className="truncate text-xs text-muted-foreground/70">
                                  {t("ascend.status.offline")}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => handleViewProfile(friend.uid, "friends")}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => handleStartConversation(friend.uid)}
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="hover:text-destructive h-8 w-8 text-muted-foreground"
                                  onClick={() => handleRemoveFriend(friend.uid)}
                                >
                                  <UserMinus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card/30 p-8 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Users className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">{t("ascend.friends.empty")}</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                    {t("ascend.friends.emptyHint")}
                  </p>
                  <Button
                    className="mt-6 gap-2 text-secondary"
                    onClick={() => setActiveSection("search")}
                  >
                    <Search className="h-4 w-4" />
                    {t("ascend.friends.findFriends")}
                  </Button>
                </div>
              )}
            </div>
          );

        case "requests":
          return (
            <div className="mb-24 space-y-6">
              {/* Header with gradient background */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-primary/10 p-6">
                <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
                <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-orange-500/20 blur-3xl" />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 backdrop-blur-sm">
                        <UserPlus className="h-6 w-6 text-amber-500" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold">
                          {t("ascend.requests.title")}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                          {t("ascend.friends.subtitle") || "Manage your friend requests"}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => setActiveSection("search")}
                      className="gap-2 text-secondary"
                    >
                      <Search className="h-4 w-4" />
                      {t("ascend.friends.findFriends")}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-2 gap-3">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-border/50 bg-card/50 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                      <UserCheck className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{incomingRequests.length}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("ascend.requests.incoming")}
                      </p>
                    </div>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="rounded-xl border border-border/50 bg-card/50 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                      <Send className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{outgoingRequests.length}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("ascend.requests.outgoing")}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {loadingRequests ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Incoming Requests */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-border/50" />
                      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        <UserCheck className="h-4 w-4 text-green-500" />
                        {t("ascend.requests.incoming")}
                      </h2>
                      <div className="h-px flex-1 bg-border/50" />
                    </div>
                    {incomingRequests.length > 0 ? (
                      <div className="space-y-3">
                        {incomingRequests.map((request, index) => (
                          <motion.div
                            key={request.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-all duration-300 hover:border-green-500/30 hover:bg-card hover:shadow-lg hover:shadow-green-500/5"
                          >
                            <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-green-500/5 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />
                            <div className="relative flex items-center justify-between p-5">
                              <div className="flex items-center gap-4">
                                <div className="relative">
                                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-green-500 via-green-500/90 to-emerald-500 shadow-lg shadow-green-500/20">
                                    <span className="text-xl font-bold text-white">
                                      {request.fromDisplayName?.[0]?.toUpperCase() || "U"}
                                    </span>
                                  </div>
                                  <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-green-500">
                                    <UserPlus className="h-3 w-3 text-white" />
                                  </div>
                                </div>
                                <div>
                                  <p className="text-lg font-semibold">
                                    {request.fromDisplayName}
                                  </p>
                                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                    {t("ascend.requests.wantsToAdd")}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  className="gap-2 rounded-xl bg-green-500 text-white hover:bg-green-600"
                                  size="sm"
                                  onClick={() =>
                                    handleAcceptRequest(request.id, request.fromUid)
                                  }
                                >
                                  <Check className="h-4 w-4" />
                                  {t("ascend.requests.accept")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-xl"
                                  onClick={() => handleDenyRequest(request.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-8 text-center"
                      >
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10">
                          <Inbox className="h-7 w-7 text-green-500/50" />
                        </div>
                        <p className="font-medium text-muted-foreground">
                          {t("ascend.requests.noIncoming")}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground/70">
                          {t("ascend.requests.empty") || "New requests will appear here"}
                        </p>
                      </motion.div>
                    )}
                  </div>

                  {/* Outgoing Requests */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-border/50" />
                      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        <Send className="h-4 w-4 text-blue-500" />
                        {t("ascend.requests.outgoing")}
                      </h2>
                      <div className="h-px flex-1 bg-border/50" />
                    </div>
                    {outgoingRequests.length > 0 ? (
                      <div className="space-y-3">
                        {outgoingRequests.map((request, index) => (
                          <motion.div
                            key={request.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-all duration-300 hover:border-blue-500/30 hover:bg-card hover:shadow-lg hover:shadow-blue-500/5"
                          >
                            <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-blue-500/5 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />
                            <div className="relative flex items-center justify-between p-5">
                              <div className="flex items-center gap-4">
                                <div className="relative">
                                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-blue-500/90 to-indigo-500 shadow-lg shadow-blue-500/20">
                                    <span className="text-xl font-bold text-white">
                                      {request.toDisplayName?.[0]?.toUpperCase() || "U"}
                                    </span>
                                  </div>
                                  <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-blue-500">
                                    <Send className="h-3 w-3 text-white" />
                                  </div>
                                </div>
                                <div>
                                  <p className="text-lg font-semibold">
                                    {request.toDisplayName}
                                  </p>
                                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                                    {t("ascend.requests.pending")}
                                  </p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl"
                                onClick={() => handleDenyRequest(request.id)}
                              >
                                <X className="mr-1.5 h-4 w-4" />
                                {t("ascend.requests.cancel")}
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-8 text-center"
                      >
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10">
                          <Send className="h-7 w-7 text-blue-500/50" />
                        </div>
                        <p className="font-medium text-muted-foreground">
                          {t("ascend.requests.noOutgoing")}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground/70">
                          {t("ascend.search.hint") ||
                            "Search for users to send friend requests"}
                        </p>
                      </motion.div>
                    )}
                  </div>
                </>
              )}
            </div>
          );

        case "messages":
          return (
            <div className="space-y-6">
              {/* Header */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-violet-500/10 p-6">
                <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl" />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-bold">{t("ascend.messages.title")}</h1>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("ascend.messages.subtitle") || "Messages from the last 7 days"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const result = await cleanupAllOldMessages();
                          if (result.success && result.totalDeleted > 0) {
                            toast.success(
                              t("ascend.messages.cleanedUp") ||
                                `Cleaned up ${result.totalDeleted} old messages`
                            );
                          }
                        }}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">
                          {t("ascend.messages.cleanup") || "Cleanup"}
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main content */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Conversations list */}
                <div className="lg:col-span-1">
                  <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm">
                    <div className="border-b border-border/30 p-4">
                      <h2 className="font-semibold">
                        {t("ascend.messages.conversations")}
                      </h2>
                    </div>
                    <div className="max-h-[calc(100vh-400px)] min-h-[300px] overflow-y-auto p-2">
                      {loadingConversations ? (
                        <div className="flex items-center justify-center p-8">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      ) : conversations.length > 0 ? (
                        <div className="space-y-1">
                          {conversations.map(conversation => (
                            <button
                              key={conversation.id}
                              onClick={() => handleSelectConversation(conversation)}
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${
                                selectedConversation?.id === conversation.id
                                  ? "bg-primary/15 ring-1 ring-primary/30"
                                  : "hover:bg-muted/50"
                              }`}
                            >
                              <div className="relative shrink-0">
                                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-md">
                                  {conversation.otherUser.photoURL ? (
                                    <img
                                      src={conversation.otherUser.photoURL}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <span className="text-sm font-bold text-secondary">
                                      {conversation.otherUser.displayName?.[0]?.toUpperCase() ||
                                        "U"}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card shadow-sm ${
                                    conversation.otherUser.status === "online"
                                      ? "bg-green-500"
                                      : conversation.otherUser.status === "away"
                                        ? "bg-yellow-500"
                                        : conversation.otherUser.status === "busy"
                                          ? "bg-red-500"
                                          : "bg-gray-400"
                                  }`}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="flex items-center gap-1 truncate text-sm font-semibold">
                                    {conversation.otherUser.displayName}
                                    {conversation.otherUser.owner && (
                                      <Crown className="h-3 w-3 shrink-0 text-yellow-500" />
                                    )}
                                    {conversation.otherUser.contributor && (
                                      <Hammer className="h-3 w-3 shrink-0 text-orange-500" />
                                    )}
                                    {conversation.otherUser.verified && (
                                      <BadgeCheck className="h-3 w-3 shrink-0 text-blue-500" />
                                    )}
                                  </p>
                                  {conversation.unreadCount > 0 && (
                                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-secondary">
                                      {conversation.unreadCount}
                                    </span>
                                  )}
                                </div>
                                {conversation.lastMessage && (
                                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {conversation.lastMessageSenderId === user?.uid
                                      ? `${t("ascend.messages.you")}: `
                                      : ""}
                                    {conversation.lastMessage}
                                  </p>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-8 text-center">
                          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                            <MessageCircle className="h-7 w-7 text-muted-foreground/50" />
                          </div>
                          <p className="text-sm font-medium">
                            {t("ascend.messages.empty")}
                          </p>
                          <p className="mb-3 mt-1 text-xs text-muted-foreground">
                            {t("ascend.messages.emptyHint")}
                          </p>
                          <Button size="sm" onClick={() => setActiveSection("friends")}>
                            <Users className="mr-2 h-3.5 w-3.5" />
                            {t("ascend.messages.startChat")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Chat area */}
                <div className="lg:col-span-2">
                  <div className="flex h-[calc(100vh-340px)] min-h-[400px] flex-col rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm">
                    {selectedConversation ? (
                      <>
                        {/* Chat header */}
                        <div className="flex items-center gap-4 border-b border-border/30 px-5 py-4">
                          <button
                            onClick={() => setSelectedConversation(null)}
                            className="rounded-lg p-2 transition-colors hover:bg-muted/50 lg:hidden"
                          >
                            <ArrowLeft className="h-5 w-5" />
                          </button>
                          <div className="relative">
                            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-md">
                              {selectedConversation.otherUser.photoURL ? (
                                <img
                                  src={selectedConversation.otherUser.photoURL}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-sm font-bold text-secondary">
                                  {selectedConversation.otherUser.displayName?.[0]?.toUpperCase() ||
                                    "U"}
                                </span>
                              )}
                            </div>
                            <div
                              className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${
                                selectedConversation.otherUser.status === "online"
                                  ? "bg-green-500"
                                  : selectedConversation.otherUser.status === "away"
                                    ? "bg-yellow-500"
                                    : selectedConversation.otherUser.status === "busy"
                                      ? "bg-red-500"
                                      : "bg-gray-400"
                              }`}
                            />
                          </div>
                          <div className="flex-1">
                            <p className="flex items-center gap-1 font-semibold">
                              {selectedConversation.otherUser.displayName}
                              {selectedConversation.otherUser.owner && (
                                <Crown className="h-4 w-4 shrink-0 text-yellow-500" />
                              )}
                              {selectedConversation.otherUser.contributor && (
                                <Hammer className="h-4 w-4 shrink-0 text-orange-500" />
                              )}
                              {selectedConversation.otherUser.verified && (
                                <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" />
                              )}
                            </p>
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span
                                className={`inline-block h-1.5 w-1.5 rounded-full ${
                                  selectedConversation.otherUser.status === "online"
                                    ? "bg-green-500"
                                    : "bg-gray-400"
                                }`}
                              />
                              {selectedConversation.otherUser.status === "online"
                                ? t("ascend.messages.online")
                                : t("ascend.messages.offline")}
                              {selectedConversation.otherUser.customMessage && (
                                <span className="ml-2 text-muted-foreground/70">
                                  — {selectedConversation.otherUser.customMessage}
                                </span>
                              )}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleViewProfile(selectedConversation.otherUser.uid)
                            }
                            className="h-9 w-9"
                          >
                            <User className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Messages area */}
                        <div className="flex-1 space-y-3 overflow-y-auto p-5">
                          {loadingMessages ? (
                            <div className="flex h-full items-center justify-center">
                              <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                          ) : messages.length > 0 ? (
                            <>
                              {/* Date separator for first message */}
                              <div className="flex items-center justify-center py-2">
                                <span className="rounded-full bg-muted/50 px-3 py-1 text-[10px] font-medium text-muted-foreground">
                                  {t("ascend.messages.last7Days") ||
                                    "Messages from the last 7 days"}
                                </span>
                              </div>
                              {messages.map((message, index) => {
                                const showAvatar =
                                  !message.isOwn &&
                                  (index === 0 || messages[index - 1]?.isOwn);
                                const showDate =
                                  index === 0 ||
                                  message.createdAt?.toDateString() !==
                                    messages[index - 1]?.createdAt?.toDateString();
                                return (
                                  <React.Fragment key={message.id}>
                                    {showDate && index > 0 && (
                                      <div className="flex items-center justify-center py-2">
                                        <span className="rounded-full bg-muted/30 px-3 py-1 text-[10px] font-medium text-muted-foreground">
                                          {message.createdAt?.toLocaleDateString(
                                            undefined,
                                            {
                                              weekday: "short",
                                              month: "short",
                                              day: "numeric",
                                            }
                                          )}
                                        </span>
                                      </div>
                                    )}
                                    <div
                                      className={`flex items-end gap-2 ${message.isOwn ? "justify-end" : "justify-start"}`}
                                    >
                                      {!message.isOwn && (
                                        <div
                                          className={`h-7 w-7 shrink-0 ${showAvatar ? "" : "invisible"}`}
                                        >
                                          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/60">
                                            {selectedConversation.otherUser.photoURL ? (
                                              <img
                                                src={
                                                  selectedConversation.otherUser.photoURL
                                                }
                                                alt=""
                                                className="h-full w-full object-cover"
                                                referrerPolicy="no-referrer"
                                              />
                                            ) : (
                                              <span className="text-[10px] font-bold text-secondary">
                                                {selectedConversation.otherUser.displayName?.[0]?.toUpperCase() ||
                                                  "U"}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                      <div
                                        className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                                          message.isOwn
                                            ? "rounded-br-md bg-gradient-to-br from-primary to-primary/90 text-secondary shadow-md"
                                            : "rounded-bl-md bg-muted/60"
                                        }`}
                                      >
                                        <p className="text-sm leading-relaxed">
                                          {message.text}
                                        </p>
                                        <div
                                          className={`mt-1 flex items-center gap-1 text-[10px] ${
                                            message.isOwn
                                              ? "text-secondary/60"
                                              : "text-muted-foreground/60"
                                          }`}
                                        >
                                          <span>
                                            {message.createdAt?.toLocaleTimeString([], {
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}
                                          </span>
                                          {message.isOwn && (
                                            <span className="ml-1">
                                              {message.read ? (
                                                <CheckCheck className="h-3 w-3" />
                                              ) : (
                                                <Check className="h-3 w-3" />
                                              )}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </React.Fragment>
                                );
                              })}
                              <div ref={messagesEndRef} />
                            </>
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center text-center">
                              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                                <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
                              </div>
                              <p className="text-sm font-medium text-muted-foreground">
                                {t("ascend.messages.noMessages")}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground/70">
                                {t("ascend.messages.startConversation") ||
                                  "Send a message to start the conversation"}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Message input */}
                        <div className="border-t border-border/30 p-4">
                          <form
                            onSubmit={e => {
                              e.preventDefault();
                              handleSendMessage();
                            }}
                            className="flex items-center gap-3"
                          >
                            <Input
                              value={messageInput}
                              onChange={e => setMessageInput(e.target.value)}
                              placeholder={t("ascend.messages.placeholder")}
                              className="h-11 flex-1 rounded-xl border-border/30 bg-muted/30 focus-visible:ring-primary/30"
                              disabled={sendingMessage}
                            />
                            <Button
                              type="submit"
                              size="icon"
                              disabled={!messageInput.trim() || sendingMessage}
                              className="h-11 w-11 shrink-0 rounded-xl text-secondary shadow-md"
                            >
                              {sendingMessage ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <Send className="h-5 w-5" />
                              )}
                            </Button>
                          </form>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20">
                          <MessageCircle className="h-10 w-10 text-primary/60" />
                        </div>
                        <p className="text-lg font-semibold">
                          {t("ascend.messages.selectConversation")}
                        </p>
                        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                          {t("ascend.messages.selectHint") ||
                            "Choose a conversation from the list to start chatting"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );

        case "notifications":
          return (
            <div className="mb-24 space-y-6">
              {/* Hero Header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-violet-500/10 p-8"
              >
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
                <div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

                <div className="relative">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/30">
                      <Bell className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold">
                        {t("ascend.notifications.title")}
                      </h1>
                      <p className="mt-2 text-muted-foreground">
                        {t("ascend.notifications.subtitle") ||
                          "Stay updated with important announcements and updates"}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Notifications Content */}
              {loadingNotifications ? (
                <div className="flex flex-col items-center justify-center py-32">
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full border-4 border-blue-500/20" />
                    <div className="absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-blue-500" />
                  </div>
                  <p className="mt-6 text-muted-foreground">
                    {t("ascend.notifications.loading") || "Loading notifications..."}
                  </p>
                </div>
              ) : notifications.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center rounded-2xl border border-border/50 bg-card/50 py-20"
                >
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
                    <Bell className="h-10 w-10 text-muted-foreground/50" />
                  </div>
                  <h3 className="mt-6 text-lg font-semibold">
                    {t("ascend.notifications.empty")}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("ascend.notifications.emptyDescription") ||
                      "You're all caught up! Check back later for new updates."}
                  </p>
                </motion.div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification, index) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-blue-500/30 hover:bg-card hover:shadow-lg hover:shadow-blue-500/5"
                    >
                      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition-all group-hover:bg-blue-500/20" />
                      <div className="relative">
                        <p className="text-sm leading-relaxed">{notification.message}</p>
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>—</span>
                          <span className="font-medium">{notification.author}</span>
                          {notification.timestamp && (
                            <>
                              <span>•</span>
                              <span>
                                {new Date(notification.timestamp).toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          );

        case "settings":
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
              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
                <div className="flex items-center justify-between border-b border-border/50 p-5">
                  <div className="flex items-center gap-2">
                    <User className="mb-3 h-5 w-5 text-primary" />
                    <h2 className="font-semibold">{t("ascend.settings.profile")}</h2>
                  </div>
                  {!isEditingProfile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStartEditProfile}
                      className="gap-2"
                    >
                      <Pencil className="h-4 w-4" />
                      {t("ascend.settings.edit")}
                    </Button>
                  )}
                </div>

                {isEditingProfile ? (
                  <div className="space-y-6 p-5">
                    {/* Avatar & Photo URL */}
                    <div className="flex items-start gap-5">
                      <div className="relative shrink-0">
                        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                          {editPhotoURL ? (
                            <img
                              src={editPhotoURL}
                              alt="Preview"
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-primary-foreground text-3xl font-bold">
                              {(editDisplayName || user.email || "U")[0].toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="absolute -bottom-2 -right-2 rounded-full bg-primary p-2 shadow-lg">
                          <Camera className="text-primary-foreground h-4 w-4" />
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="photoURL" className="text-sm font-medium">
                          {t("ascend.settings.photoURL")}
                        </Label>
                        <Input
                          id="photoURL"
                          type="url"
                          placeholder={t("ascend.settings.photoURLPlaceholder")}
                          value={editPhotoURL}
                          onChange={e => setEditPhotoURL(e.target.value)}
                          className="h-11 rounded-xl"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("ascend.settings.photoURLHint")}
                        </p>
                      </div>
                    </div>

                    {/* Display Name */}
                    <div className="space-y-2">
                      <Label htmlFor="editDisplayName" className="text-sm font-medium">
                        {t("ascend.settings.displayName")}
                      </Label>
                      <Input
                        id="editDisplayName"
                        type="text"
                        placeholder={t("account.form.displayNamePlaceholder")}
                        value={editDisplayName}
                        onChange={e => setEditDisplayName(e.target.value)}
                        className="h-11 rounded-xl"
                      />
                    </div>

                    {/* Bio */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="editBio" className="text-sm font-medium">
                          {t("ascend.settings.bio")}
                        </Label>
                        <span
                          className={`text-xs ${editBio.length > 100 ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {editBio.length}/100
                        </span>
                      </div>
                      <textarea
                        id="editBio"
                        placeholder={t("ascend.settings.bioPlaceholder")}
                        value={editBio}
                        onChange={e => setEditBio(e.target.value.slice(0, 100))}
                        className="h-20 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        maxLength={100}
                      />
                    </div>

                    {/* Country */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="editCountry"
                        className="flex items-center gap-2 text-sm font-medium"
                      >
                        <Globe className="h-4 w-4 text-blue-500" />
                        {t("ascend.settings.country")}
                      </Label>
                      <Input
                        id="editCountry"
                        type="text"
                        placeholder={t("ascend.settings.countryPlaceholder")}
                        value={editCountry}
                        onChange={e => setEditCountry(e.target.value)}
                        className="h-11 rounded-xl"
                      />
                    </div>

                    {/* Social Links */}
                    <div className="space-y-4">
                      <h3 className="flex items-center gap-2 text-sm font-medium">
                        <Link2 className="h-4 w-4 text-primary" />
                        {t("ascend.settings.socialLinks")}
                      </h3>

                      <div className="grid gap-4">
                        {/* Discord (Read-only) */}
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5865F2]/10">
                            <svg
                              className="h-5 w-5 text-[#5865F2]"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <Input
                              type="text"
                              placeholder={t("ascend.settings.discordPlaceholder")}
                              value={editDiscord}
                              readOnly
                              disabled
                              className="h-11 cursor-not-allowed rounded-xl bg-muted/50"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("ascend.settings.discordReadOnly") ||
                                "Discord username is read-only"}
                            </p>
                          </div>
                        </div>

                        {/* Epic Games ID */}
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/10">
                            <Gamepad2 className="h-5 w-5" />
                          </div>
                          <Input
                            type="text"
                            placeholder={
                              t("ascend.settings.epicIdPlaceholder") ||
                              "Your Epic Games ID"
                            }
                            value={editEpicId}
                            onChange={e => setEditEpicId(e.target.value)}
                            className="h-11 flex-1 rounded-xl"
                          />
                        </div>

                        {/* GitHub */}
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/10">
                            <Github className="h-5 w-5" />
                          </div>
                          <Input
                            type="text"
                            placeholder={t("ascend.settings.githubPlaceholder")}
                            value={editGithub}
                            onChange={e => setEditGithub(e.target.value)}
                            className="h-11 flex-1 rounded-xl"
                          />
                        </div>

                        {/* Steam */}
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/10">
                            <svg
                              className="h-5 w-5 text-[#1b2838] dark:text-white"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
                            </svg>
                          </div>
                          <Input
                            type="text"
                            placeholder={t("ascend.settings.steamPlaceholder")}
                            value={editSteam}
                            onChange={e => setEditSteam(e.target.value)}
                            className="h-11 flex-1 rounded-xl"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3 border-t border-border/50 pt-4">
                      <Button
                        onClick={handleSaveProfile}
                        disabled={isSavingProfile}
                        className="h-11 flex-1 text-secondary"
                      >
                        {isSavingProfile ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        {t("ascend.settings.save")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleCancelEditProfile}
                        disabled={isSavingProfile}
                        className="h-11"
                      >
                        {t("ascend.settings.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5">
                    {/* Profile Display */}
                    <div className="flex items-start gap-5">
                      <div className="relative shrink-0">
                        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                          {user.photoURL ? (
                            <img
                              src={user.photoURL}
                              alt={user.displayName}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-primary-foreground text-3xl font-bold">
                              {(user.displayName || user.email || "U")[0].toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="flex items-center gap-1 truncate text-xl font-semibold">
                          {user.displayName}
                          {userData?.owner && (
                            <Crown className="mt-1 h-4 w-4 shrink-0 text-yellow-500" />
                          )}
                          {userData?.contributor && (
                            <Hammer className="mt-1 h-4 w-4 shrink-0 text-orange-500" />
                          )}
                          {userData?.verified && (
                            <BadgeCheck className="mt-1 h-4 w-4 shrink-0 text-blue-500" />
                          )}
                        </h3>
                        <p className="truncate text-sm text-muted-foreground">
                          {user.email}
                        </p>

                        {/* Bio */}
                        {userData?.bio && (
                          <p className="mt-3 line-clamp-2 text-sm text-foreground/80">
                            {userData.bio}
                          </p>
                        )}

                        {/* Country */}
                        {userData?.country && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                            <Globe className="h-4 w-4 text-blue-500" />
                            <span>{userData.country}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Social Links Display */}
                    {(userData?.socials?.linkedDiscord ||
                      userData?.socials?.epicId ||
                      userData?.socials?.github ||
                      userData?.socials?.steam) && (
                      <div className="mt-5 border-t border-border/50 pt-5">
                        <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                          {t("ascend.settings.socialLinks")}
                        </h4>
                        <div className="flex flex-wrap gap-3">
                          {userData?.socials?.linkedDiscord && (
                            <div className="flex items-center gap-2 rounded-xl bg-[#5865F2]/10 px-3 py-2 text-sm">
                              <svg
                                className="h-4 w-4 text-[#5865F2]"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                              </svg>
                              <span>{userData.socials.linkedDiscord}</span>
                            </div>
                          )}
                          {userData?.socials?.epicId && (
                            <div className="flex items-center gap-2 rounded-xl bg-foreground/10 px-3 py-2 text-sm">
                              <Gamepad2 className="h-4 w-4" />
                              <span>{userData.socials.epicId}</span>
                            </div>
                          )}
                          {userData?.socials?.github && (
                            <div className="flex items-center gap-2 rounded-xl bg-foreground/10 px-3 py-2 text-sm">
                              <Github className="h-4 w-4" />
                              <span>{userData.socials.github}</span>
                            </div>
                          )}
                          {userData?.socials?.steam && (
                            <div className="flex items-center gap-2 rounded-xl bg-foreground/10 px-3 py-2 text-sm">
                              <svg
                                className="h-4 w-4 dark:text-white"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
                              </svg>
                              <span>{userData.socials.steam}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Empty state for bio/socials */}
                    {!userData?.bio &&
                      !userData?.country &&
                      !userData?.socials?.linkedDiscord &&
                      !userData?.socials?.github &&
                      !userData?.socials?.steam && (
                        <div className="mt-5 border-t border-border/50 pt-5 text-center">
                          <p className="text-sm text-muted-foreground">
                            {t("ascend.settings.noProfileInfo")}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleStartEditProfile}
                            className="mt-3 gap-2"
                          >
                            <Sparkle className="h-4 w-4" />
                            {t("ascend.settings.addProfileInfo")}
                          </Button>
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* Webapp Connection Card */}
              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
                <div className="flex items-center justify-between border-b border-border/50 p-5">
                  <div className="flex items-center gap-2">
                    <Smartphone className="mb-3 h-5 w-5 text-primary" />
                    <h2 className="font-semibold">
                      {t("ascend.settings.webappConnection") || "Webapp Connection"}
                    </h2>
                  </div>
                </div>
                <div className="p-5">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Globe className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium">
                          {t("ascend.settings.connectYourPhone") || "Connect Your Phone"}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("ascend.settings.connectYourPhoneDescription") ||
                            "Access your Ascendara library and stats from any device by connecting through monitor.ascendara.app"}
                        </p>
                        <div className="mt-3 flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2 ring-1 ring-primary/20">
                          <svg
                            className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              {t("ascend.settings.securityTitle") ||
                                "End-to-end encrypted."}
                            </span>{" "}
                            {t("ascend.settings.securityDescription") ||
                              "Commands are sent through a secure API, and your Ascendara app decides whether and how to execute them."}
                            &nbsp;
                            <a
                              className="inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
                              onClick={() =>
                                window.electron.openURL("https://ascendara.app/webview")
                              }
                            >
                              {t("common.learnMore")}
                              <ExternalLink className="ml-1 h-3 w-3" />
                            </a>
                          </p>
                        </div>
                      </div>
                    </div>

                    {!webappConnectionCode ? (
                      <Button
                        onClick={handleGenerateWebappCode}
                        disabled={isGeneratingCode}
                        className="w-full text-secondary"
                      >
                        {isGeneratingCode ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("ascend.settings.generating") || "Generating..."}
                          </>
                        ) : (
                          <>
                            <Link2 className="mr-2 h-4 w-4" />
                            {t("ascend.settings.startConnection") || "Start Connection"}
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          {/* Left Column - Code Display */}
                          <div className="space-y-4">
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
                              <div className="text-center">
                                <p className="mb-3 text-sm font-medium text-muted-foreground">
                                  {t("ascend.settings.enterThisCode") ||
                                    "Enter this code on your phone"}
                                </p>
                                <div className="mb-4 flex items-center justify-center gap-2">
                                  {webappConnectionCode.split("").map((digit, index) => (
                                    <div
                                      key={index}
                                      className="flex h-14 w-12 items-center justify-center rounded-lg border-2 border-primary bg-background text-2xl font-bold text-primary"
                                    >
                                      {digit}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  <span>
                                    {t("ascend.settings.codeExpiresIn") ||
                                      "Code expires in"}{" "}
                                    {webappCodeExpiry}s
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                              <Info className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground">
                                {t("ascend.settings.visitMonitor")}
                              </p>
                            </div>
                          </div>

                          {/* Right Column - QR Code */}
                          {webappQRCode && (
                            <div className="flex items-center justify-center rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-6">
                              <div className="text-center">
                                <div className="rounded-lg bg-white p-3 shadow-lg">
                                  <img
                                    src={webappQRCode}
                                    alt="QR Code"
                                    className="h-40 w-40"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={handleCopyWebappCode}
                            variant="outline"
                            className="flex-1"
                          >
                            {webappCodeCopied ? (
                              <Check className="mr-2 h-4 w-4" />
                            ) : (
                              <Copy className="mr-2 h-4 w-4" />
                            )}
                            {webappCodeCopied
                              ? t("ascend.settings.codeCopied") || "Copied Code"
                              : t("ascend.settings.copyCode") || "Copy Code"}
                          </Button>
                          <Button
                            onClick={handleCancelWebappConnection}
                            variant="outline"
                            className="flex-1"
                          >
                            <X className="mr-2 h-4 w-4" />
                            {t("ascend.settings.cancel") || "Cancel"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Connected Devices Section */}
                    <div className="mt-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">
                          {t("ascend.settings.connectedDevices") || "Connected Devices"}
                        </h4>
                        <Button
                          onClick={loadConnectedDevices}
                          variant="ghost"
                          size="sm"
                          disabled={loadingDevices}
                        >
                          <RefreshCw
                            className={`h-4 w-4 ${loadingDevices ? "animate-spin" : ""}`}
                          />
                        </Button>
                      </div>

                      {loadingDevices ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : connectedDevices.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
                          <Smartphone className="mx-auto h-8 w-8 text-muted-foreground/50" />
                          <p className="mt-2 text-sm text-muted-foreground">
                            {t("ascend.settings.noConnectedDevices") ||
                              "No devices connected"}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {connectedDevices.map(device => {
                            const iconName = getDeviceIcon(device.deviceInfo);
                            const DeviceIcon =
                              iconName === "Smartphone"
                                ? Smartphone
                                : iconName === "Tablet"
                                  ? Gamepad2
                                  : iconName === "Laptop"
                                    ? Laptop
                                    : Monitor;
                            const deviceDescription = getDeviceDescription(
                              device.deviceInfo
                            );

                            return (
                              <div
                                key={device.sessionId}
                                className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                    <DeviceIcon className="h-5 w-5 text-primary" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      {device.deviceInfo?.platform || "Web Device"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {deviceDescription}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {t("ascend.settings.lastActive") || "Last active"}:{" "}
                                      {new Date(
                                        device.lastActive?.seconds * 1000 ||
                                          device.lastActive
                                      ).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  onClick={() => handleDisconnectDevice(device.sessionId)}
                                  variant="ghost"
                                  size="sm"
                                  disabled={disconnectingDevice === device.sessionId}
                                >
                                  {disconnectingDevice === device.sessionId ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <X className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Privacy Settings Card */}
              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
                <div className="flex items-center justify-between border-b border-border/50 p-5">
                  <div className="flex items-center gap-2">
                    <LockIcon className="mb-3 h-5 w-5 text-primary" />
                    <h2 className="font-semibold">
                      {t("ascend.settings.privacy") || "Privacy"}
                    </h2>
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {t("ascend.settings.privateAccount") || "Private Account"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("ascend.settings.privateAccountDescription") ||
                          "When enabled, other users won't be able to see your profile details, games, or achievements."}
                      </p>
                    </div>
                    <div className="ml-4">
                      <Checkbox
                        id="privateAccount"
                        checked={userData?.private || false}
                        onCheckedChange={async checked => {
                          try {
                            const result = await updateData({ private: checked });
                            if (result.success) {
                              toast.success(
                                checked
                                  ? t("ascend.settings.accountNowPrivate") ||
                                      "Your account is now private"
                                  : t("ascend.settings.accountNowPublic") ||
                                      "Your account is now public"
                              );
                            } else {
                              toast.error(
                                result.error ||
                                  t("ascend.settings.privacyUpdateFailed") ||
                                  "Failed to update privacy setting"
                              );
                            }
                          } catch (e) {
                            console.error("Failed to update privacy setting:", e);
                            toast.error(
                              t("ascend.settings.privacyUpdateFailed") ||
                                "Failed to update privacy setting"
                            );
                          }
                        }}
                        className="h-5 w-5"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Subscription Management */}
              <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/50">
                {/* Animated background effects for subscribed/verified users */}
                {(ascendAccess.isSubscribed || ascendAccess.isVerified) && (
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div
                      className={`absolute -right-20 -top-20 h-64 w-64 rounded-full blur-3xl ${ascendAccess.isVerified ? "bg-gradient-to-br from-blue-500/20 to-cyan-500/10" : "bg-gradient-to-br from-yellow-500/20 to-amber-500/10"}`}
                    />
                    <div
                      className={`absolute -bottom-20 -left-20 h-64 w-64 rounded-full blur-3xl ${ascendAccess.isVerified ? "bg-gradient-to-br from-violet-500/20 to-blue-500/10" : "bg-gradient-to-br from-primary/20 to-violet-500/10"}`}
                    />
                    <div
                      className={`absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent to-transparent ${ascendAccess.isVerified ? "via-blue-500/50" : "via-yellow-500/50"}`}
                    />
                  </div>
                )}

                <div className="relative flex items-center justify-between border-b border-border/50 p-5">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${ascendAccess.isVerified ? "bg-gradient-to-br from-blue-500/20 to-cyan-500/20" : ascendAccess.isSubscribed ? "bg-gradient-to-br from-yellow-500/20 to-amber-500/20" : "bg-primary/10"}`}
                    >
                      {ascendAccess.isVerified ? (
                        <BadgeCheck className="h-4 w-4 text-blue-500" />
                      ) : (
                        <BadgeDollarSign
                          className={`h-4 w-4 ${ascendAccess.isSubscribed ? "text-yellow-500" : "text-primary"}`}
                        />
                      )}
                    </div>
                    <h2 className="mt-2 font-semibold">
                      {t("ascend.settings.subscription")}
                    </h2>
                  </div>
                  {ascendAccess.isVerified ? (
                    <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500/20 to-cyan-500/20 px-3 py-1">
                      <BadgeCheck className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        VERIFIED
                      </span>
                    </div>
                  ) : ascendAccess.isSubscribed ? (
                    <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-yellow-500/20 to-amber-500/20 px-3 py-1">
                      <Sparkle className="h-3.5 w-3.5 text-yellow-500" />
                      <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
                        PRO
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Developer Mode Subscription State Switcher */}
                {isDev && (
                  <div className="border-t border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-muted-foreground">
                        Dev: Subscription State
                      </span>
                      <Select
                        value={devSubscriptionState}
                        onValueChange={setDevSubscriptionState}
                      >
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="trial">Trial Active</SelectItem>
                          <SelectItem value="verified">Verified</SelectItem>
                          <SelectItem value="subscribed">Subscribed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="relative p-5">
                  {(isDev && devSubscriptionState === "verified") ||
                  (!isDev && ascendAccess.isVerified) ? (
                    // Verified User - Special Design
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/25">
                            <BadgeCheck className="h-8 w-8 text-white" />
                          </div>
                          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background">
                            <Check className="h-4 w-4 text-white" />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="bg-gradient-to-r from-blue-500 to-cyan-600 bg-clip-text text-xl font-bold text-transparent">
                              {t("ascend.settings.verifiedUser") || "Verified User"}
                            </h3>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {t("ascend.settings.verifiedDescription") ||
                              "You have full access to all Ascend features"}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 ring-1 ring-emerald-500/20"
                        >
                          <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-emerald-500/10 blur-xl transition-all group-hover:bg-emerald-500/20" />
                          <p className="mb-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {t("ascend.settings.status")}
                          </p>
                          <p className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                            </span>
                            {t("ascend.settings.active")}
                          </p>
                        </motion.div>
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-4 ring-1 ring-blue-500/20"
                        >
                          <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-blue-500/10 blur-xl transition-all group-hover:bg-blue-500/20" />
                          <p className="mb-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                            {t("ascend.settings.accessType") || "Access Type"}
                          </p>
                          <p className="font-semibold text-blue-600 dark:text-blue-400">
                            {t("ascend.settings.lifetime") || "Lifetime"}
                          </p>
                        </motion.div>
                      </div>

                      <div className="rounded-xl bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-violet-500/10 p-4 ring-1 ring-blue-500/20">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                            <Heart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {t("ascend.settings.verifiedThankYou") ||
                                "Thank you for being part of Ascendara!"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("ascend.settings.verifiedThankYouSub") ||
                                "Your contributions help make this possible"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (isDev && devSubscriptionState === "subscribed") ||
                    (!isDev && ascendAccess.isSubscribed) ? (
                    // Active Subscription - Premium Design
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500 to-amber-600 shadow-lg shadow-yellow-500/25">
                            <BadgeDollarSign className="h-8 w-8 text-white" />
                          </div>
                          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background">
                            <BadgeCheck className="h-4 w-4 text-white" />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="bg-gradient-to-r from-yellow-500 to-amber-600 bg-clip-text text-xl font-bold text-transparent">
                              {t("ascend.settings.ascendSubscription") || "Ascend"}
                            </h3>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {t("ascend.settings.thankYouSubscriber")}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4 ring-1 ring-emerald-500/20"
                        >
                          <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-emerald-500/10 blur-xl transition-all group-hover:bg-emerald-500/20" />
                          <p className="mb-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {t("ascend.settings.status")}
                          </p>
                          <p className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                            </span>
                            {t("ascend.settings.active")}
                          </p>
                        </motion.div>
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 p-4 ring-1 ring-primary/20"
                        >
                          <div className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-primary/10 blur-xl transition-all group-hover:bg-primary/20" />
                          <p className="mb-1 text-xs font-medium text-primary">
                            {t("ascend.settings.billingCycle")}
                          </p>
                          <p className="font-semibold">{t("ascend.settings.monthly")}</p>
                        </motion.div>
                      </div>

                      <div className="rounded-xl bg-gradient-to-r from-yellow-500/10 via-amber-500/10 to-orange-500/10 p-4 ring-1 ring-yellow-500/20">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/20">
                            <Heart className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {t("ascend.settings.supportMessage")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("ascend.settings.supportMessageSub")}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="outline"
                          className="h-12 gap-2 border-primary/30 bg-primary/5 hover:bg-primary/10"
                          onClick={handleViewInvoices}
                        >
                          <CreditCard className="h-4 w-4" />
                          {t("ascend.settings.viewInvoices")}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-12 gap-2 border-primary/30 bg-primary/5 hover:bg-primary/10"
                          onClick={handleManageSubscription}
                        >
                          <Settings className="h-4 w-4" />
                          {t("ascend.settings.manageSubscription")}
                        </Button>
                      </div>
                    </div>
                  ) : (isDev && devSubscriptionState === "trial") ||
                    (!isDev &&
                      ascendAccess.hasAccess &&
                      ascendAccess.daysRemaining > 0) ? (
                    // Trial Active - Premium Features Showcase
                    <div className="space-y-5">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-green-600/20 ring-2 ring-emerald-500/20">
                            <BadgeCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                          </div>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold">
                            {t("ascend.settings.trialActive") || "Trial Active"}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {t("ascend.settings.trialDaysRemaining", {
                              days:
                                isDev && devSubscriptionState === "trial"
                                  ? 5
                                  : ascendAccess.daysRemaining,
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl bg-gradient-to-br from-primary/10 to-violet-500/10 p-4 ring-1 ring-primary/20">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {t("ascend.settings.trialProgress")}
                          </span>
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                            {isDev && devSubscriptionState === "trial"
                              ? 5
                              : ascendAccess.daysRemaining}{" "}
                            {t("ascend.settings.daysLeft")}
                          </span>
                        </div>
                        <div className="h-3 w-full overflow-hidden rounded-full bg-muted/50">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${((7 - (isDev && devSubscriptionState === "trial" ? 5 : ascendAccess.daysRemaining)) / 7) * 100}%`,
                            }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500"
                          />
                        </div>
                      </div>

                      <div className="rounded-xl bg-gradient-to-r from-emerald-500/10 via-green-500/10 to-teal-500/10 p-4 ring-1 ring-emerald-500/20">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
                            <Sparkle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {t("ascend.settings.enjoyingAscend") ||
                                "Enjoying all Ascend features"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("ascend.settings.subscribeToKeep") ||
                                "Subscribe to keep them forever"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="max-h-[280px] space-y-2 overflow-y-auto pr-2">
                        {[
                          {
                            icon: Users,
                            title: "Friends System",
                            desc: "Build your gaming network",
                          },
                          {
                            icon: MessageCircle,
                            title: "Real-Time Chat",
                            desc: "Chat with friends directly",
                          },
                          {
                            icon: CloudIcon,
                            title: "Cloud Sync",
                            desc: "Data synced across devices",
                          },
                          {
                            icon: Trophy,
                            title: "Public Leaderboard",
                            desc: "Compete with the community",
                          },
                          {
                            icon: Infinity,
                            title: "Unlimited Downloads",
                            desc: "No download restrictions",
                          },
                          {
                            icon: Zap,
                            title: "FLiNG Trainer",
                            desc: "Auto trainer downloads",
                          },
                          {
                            icon: ListOrdered,
                            title: "Download Queue",
                            desc: "Queue multiple downloads",
                          },
                          {
                            icon: Sparkle,
                            title: "And More",
                            desc: "Plus many other features",
                          },
                        ].map((feature, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex items-center gap-3 rounded-lg bg-muted/30 p-2.5"
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <feature.icon className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium">{feature.title}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {feature.desc}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {!deletedAccountWarning ? (
                        <Button
                          className="h-12 w-full gap-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-white shadow-lg shadow-yellow-500/25 transition-all hover:scale-[1.02] hover:shadow-yellow-500/40"
                          onClick={handleSubscribe}
                        >
                          <Crown className="h-4 w-4" />
                          {t("ascend.settings.keepAscendForever") ||
                            "Keep Ascend Forever"}
                        </Button>
                      ) : (
                        <div className="bg-destructive/10 border-destructive/30 text-destructive rounded-lg border p-4 text-center text-sm">
                          {t("account.errors.cannotSubscribeDeleted") ||
                            "Cannot subscribe - account deleted"}
                        </div>
                      )}
                    </div>
                  ) : (
                    // No Access / Trial Expired - Premium Features Showcase
                    <div className="space-y-5">
                      <div className="text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-600/20 ring-2 ring-yellow-500/20">
                          <Crown className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <h3 className="text-xl font-bold">
                          {t("ascend.settings.keepAscend") || "Keep Ascend Forever"}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("ascend.settings.keepAscendDescription") ||
                            "Subscribe to make all these features permanent"}
                        </p>
                      </div>

                      <div className="max-h-[400px] space-y-2 overflow-y-auto pr-2">
                        {[
                          {
                            icon: Users,
                            title: t("ascend.premium.friends.title"),
                            desc: t("ascend.premium.friends.description"),
                          },
                          {
                            icon: Smartphone,
                            title: t("ascend.premium.webView.title"),
                            desc: t("ascend.premium.webView.description"),
                          },
                          {
                            icon: MessageCircle,
                            title: t("ascend.premium.chat.title"),
                            desc: t("ascend.premium.chat.description"),
                          },
                          {
                            icon: User,
                            title: t("ascend.premium.profile.title"),
                            desc: t("ascend.premium.profile.description"),
                          },
                          {
                            icon: CloudIcon,
                            title: t("ascend.premium.cloudSync.title"),
                            desc: t("ascend.premium.cloudSync.description"),
                          },
                          {
                            icon: CloudUpload,
                            title: t("ascend.premium.cloudBackups.title"),
                            desc: t("ascend.premium.cloudBackups.description"),
                          },
                          {
                            icon: Trophy,
                            title: t("ascend.premium.leaderboard.title"),
                            desc: t("ascend.premium.leaderboard.description"),
                          },
                          {
                            icon: RefreshCw,
                            title: t("ascend.premium.autoUpdate.title"),
                            desc: t("ascend.premium.autoUpdate.description"),
                          },
                          {
                            icon: Eye,
                            title: t("ascend.premium.upcoming.title"),
                            desc: t("ascend.premium.upcoming.description"),
                          },
                          {
                            icon: Puzzle,
                            title: t("ascend.premium.nexusMods.title"),
                            desc: t("ascend.premium.nexusMods.description"),
                          },
                          {
                            icon: Infinity,
                            title: t("ascend.premium.unlimitedDownloads.title"),
                            desc: t("ascend.premium.unlimitedDownloads.description"),
                          },
                          {
                            icon: Zap,
                            title: t("ascend.premium.flingTrainer.title"),
                            desc: t("ascend.premium.flingTrainer.description"),
                          },
                          {
                            icon: ListOrdered,
                            title: t("ascend.premium.downloadQueue.title"),
                            desc: t("ascend.premium.downloadQueue.description"),
                          },
                          {
                            icon: Users,
                            title: t("ascend.premium.communities.title"),
                            desc: t("ascend.premium.communities.description"),
                            badge: t("ascend.premium.planned"),
                          },
                          {
                            icon: Sparkle,
                            title: t("ascend.premium.moreComing.title"),
                            desc: t("ascend.premium.moreComing.description"),
                          },
                        ].map((feature, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="group relative flex items-start gap-3 rounded-lg bg-gradient-to-r from-muted/50 to-muted/30 p-3 transition-colors hover:from-primary/10 hover:to-primary/5"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                              <feature.icon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{feature.title}</p>
                                {feature.badge && (
                                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                    {feature.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {feature.desc}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {!deletedAccountWarning ? (
                        <Button
                          className="h-12 w-full gap-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-white shadow-lg shadow-yellow-500/25 transition-all hover:scale-[1.02] hover:shadow-yellow-500/40"
                          onClick={handleSubscribe}
                        >
                          <Crown className="h-4 w-4" />
                          {t("ascend.settings.subscribeToPro") ||
                            "Subscribe to Ascend Pro"}
                        </Button>
                      ) : (
                        <div className="bg-destructive/10 border-destructive/30 text-destructive rounded-lg border p-4 text-center text-sm">
                          {t("account.errors.cannotSubscribeDeleted") ||
                            "Cannot subscribe - this device is associated with a deleted account"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Subscription Success Dialog */}
              <AlertDialog
                open={showSubscriptionSuccess}
                onOpenChange={setShowSubscriptionSuccess}
              >
                <AlertDialogContent className="max-w-md overflow-hidden border-0 bg-gradient-to-b from-background to-background/95 p-0 shadow-2xl">
                  <AlertDialogHeader className="sr-only">
                    <AlertDialogTitle>
                      {t("ascend.settings.welcomeToAscend")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("ascend.settings.subscriptionSuccessMessage")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-yellow-500/20 blur-3xl" />
                    <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
                    <div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent" />
                  </div>

                  <div className="relative p-8 text-center">
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", duration: 0.8 }}
                      className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-yellow-500 to-amber-600 shadow-xl shadow-yellow-500/30"
                    >
                      <Crown className="h-10 w-10 text-white" />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <h2 className="mb-2 bg-gradient-to-r from-yellow-500 to-amber-600 bg-clip-text text-2xl font-bold text-transparent">
                        {t("ascend.settings.welcomeToAscend")}
                      </h2>
                      <p className="mb-6 text-muted-foreground">
                        {t("ascend.settings.subscriptionSuccessMessage")}
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <BadgeCheck className="h-4 w-4 text-emerald-500" />
                        <span>{t("ascend.settings.allFeaturesUnlocked")}</span>
                      </div>

                      <Button
                        className="h-12 w-full gap-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-white shadow-lg shadow-yellow-500/25 transition-shadow hover:shadow-yellow-500/40"
                        onClick={() => setShowSubscriptionSuccess(false)}
                      >
                        <Sparkle className="h-4 w-4" />
                        {t("ascend.settings.startExploring")}
                      </Button>
                    </motion.div>
                  </div>
                </AlertDialogContent>
              </AlertDialog>

              {/* Discord Verification Card */}
              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
                <div className="flex items-center justify-between border-b border-border/50 p-5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5865F2]/10">
                      <svg
                        className="h-4 w-4 text-[#5865F2]"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                      </svg>
                    </div>
                    <h2 className="mt-2 font-semibold">
                      {t("ascend.settings.discordVerification") || "Discord Verification"}
                    </h2>
                  </div>
                </div>

                <div className="p-5">
                  <div className="space-y-4">
                    {/* Trial Warning Banner */}
                    {!ascendAccess.isSubscribed && !ascendAccess.isVerified && (
                      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/20">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                              {t("ascend.settings.verificationRequiresSubscription") ||
                                "Subscription Required"}
                            </p>
                            <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">
                              {t("ascend.settings.verificationTrialWarning") ||
                                "The verification command only works for active subscribers. Subscribe to Ascend to get verified and unlock exclusive Discord roles."}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5865F2]/10">
                        <BadgeCheck className="h-5 w-5 text-[#5865F2]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="mb-1 font-medium">
                          {t("ascend.settings.verifyYourAccount") ||
                            "Verify Your Account"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {t("ascend.settings.discordVerificationDescription") ||
                            "Get verified on our Discord server to unlock exclusive roles and features."}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-muted/50 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Info className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">
                          {t("ascend.settings.howToVerify") || "How to Verify"}
                        </span>
                      </div>
                      <ol className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            1
                          </span>
                          <span>
                            {t("ascend.settings.verifyStep1") ||
                              "Join our Discord server"}
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            2
                          </span>
                          <span>
                            {t("ascend.settings.verifyStep2") ||
                              "Run the following command in any channel:"}
                          </span>
                        </li>
                      </ol>

                      <div className="mt-3 rounded-lg bg-background/80 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <code className="font-mono text-xs text-muted-foreground">
                            {t("ascend.settings.verifyCommand") || "Verification Command"}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 gap-1 px-2 text-xs"
                            onClick={() => {
                              const command = `=verifyascend ${user?.uid?.substring(0, 10) || ""}`;
                              navigator.clipboard.writeText(command);
                              toast.success(
                                t("ascend.settings.commandCopied") ||
                                  "Command copied to clipboard!"
                              );
                            }}
                          >
                            <Copy className="h-3 w-3" />
                            {t("ascend.settings.copy") || "Copy"}
                          </Button>
                        </div>
                        <div className="rounded bg-muted/50 px-3 py-2 font-mono text-sm">
                          =verifyascend {user?.uid?.substring(0, 10) || "XXXXXXXXXX"}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full gap-2 border-[#5865F2]/30 bg-[#5865F2]/5 hover:bg-[#5865F2]/10"
                      onClick={() =>
                        window.electron?.openURL("https://ascendara.app/discord")
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t("ascend.settings.joinDiscord") || "Join Discord Server"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Account Actions */}
              <div className="mt-8 space-y-4 border-t border-border/50 pt-8">
                <h3 className="mb-4 text-sm font-medium text-muted-foreground">
                  {t("account.actions") || "Account Actions"}
                </h3>

                {/* Sign out button */}
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={handleLogout}
                  className="group flex w-full items-center justify-between rounded-xl border border-border/50 bg-card/50 p-4 text-left backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 transition-colors group-hover:bg-primary/10">
                      <LogOut className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                    </div>
                    <div>
                      <span className="font-medium">{t("account.signOut")}</span>
                      <p className="text-xs text-muted-foreground">
                        {t("account.signOutDescription") || "Sign out of your account"}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </motion.button>

                {/* Request Account Deletion */}
                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <AlertDialogTrigger asChild>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="group flex w-full items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-4 text-left backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-primary/10"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                          <Trash2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <span className="font-medium text-foreground">
                            {t("account.requestDeletion") || "Request Account Deletion"}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {t("account.deletionWarning") ||
                              "This action cannot be undone"}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </motion.button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="sm:max-w-md">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2 text-foreground">
                        <Trash2 className="h-5 w-5 text-primary" />
                        {t("account.deletion.title") || "Delete Account"}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="space-y-3">
                        <p>
                          {t("account.deletion.description") ||
                            "This will permanently delete your account and all associated data. This action cannot be undone."}
                        </p>
                        <div className="space-y-2">
                          <Label
                            htmlFor="delete-password"
                            className="text-sm font-medium"
                          >
                            {t("account.deletion.enterPassword") ||
                              "Enter your password to confirm"}
                          </Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id="delete-password"
                              type="password"
                              value={deletePassword}
                              onChange={e => setDeletePassword(e.target.value)}
                              placeholder="••••••••"
                              className="pl-10"
                              disabled={isDeletingAccount}
                            />
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col gap-3 sm:flex-col">
                      {/* Hold to delete button */}
                      <div className="relative w-full overflow-hidden rounded-lg">
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-primary to-secondary"
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: deleteHoldProgress / 100 }}
                          style={{ transformOrigin: "left" }}
                          transition={{ duration: 0.05 }}
                        />
                        <button
                          onMouseDown={handleDeleteMouseDown}
                          onMouseUp={handleDeleteMouseUp}
                          onMouseLeave={handleDeleteMouseUp}
                          onTouchStart={handleDeleteMouseDown}
                          onTouchEnd={handleDeleteMouseUp}
                          disabled={isDeletingAccount || deleteConfirmed}
                          className="relative flex h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-primary bg-primary/10 font-medium text-primary transition-all hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <AnimatePresence mode="wait">
                            {deleteConfirmed ? (
                              <motion.div
                                key="confirmed"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 500,
                                  damping: 30,
                                }}
                                className="flex items-center gap-2 text-secondary"
                              >
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: [0, 1.2, 1] }}
                                  transition={{ duration: 0.4, times: [0, 0.6, 1] }}
                                >
                                  <Check className="h-5 w-5" />
                                </motion.div>
                                <span>
                                  {t("account.deletion.confirmed") || "Confirmed"}
                                </span>
                              </motion.div>
                            ) : isDeletingAccount ? (
                              <motion.div
                                key="deleting"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex items-center gap-2"
                              >
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{
                                    duration: 1,
                                    repeat: Infinity,
                                    ease: "linear",
                                  }}
                                >
                                  <Loader2 className="h-4 w-4" />
                                </motion.div>
                                <span>
                                  {t("account.deletion.deleting") || "Deleting..."}
                                </span>
                              </motion.div>
                            ) : (
                              <motion.div
                                key="hold"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex items-center gap-2"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span
                                  className={
                                    deleteHoldProgress > 0 ? "text-secondary" : ""
                                  }
                                >
                                  {deleteHoldProgress > 0
                                    ? `${t("account.deletion.holdToDelete") || "Hold to delete"} (${Math.round(deleteHoldProgress)}%)`
                                    : t("account.deletion.holdButton") ||
                                      "Hold for 3 seconds to delete"}
                                </span>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </button>
                      </div>
                      <AlertDialogCancel
                        className="w-full"
                        onClick={() => {
                          setDeletePassword("");
                          setDeleteHoldProgress(0);
                        }}
                      >
                        {t("common.cancel") || "Cancel"}
                      </AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );

        case "cloudlibrary":
          const filteredGames = getFilteredLibraryGames();
          const achievementPercentage =
            cloudLibrary?.totalAchievements > 0
              ? Math.round(
                  (cloudLibrary.unlockedAchievements / cloudLibrary.totalAchievements) *
                    100
                )
              : 0;
          return (
            <div className="mb-24 space-y-6">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-violet-500/10 p-6">
                <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl" />
                <div className="relative flex items-start justify-between">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 backdrop-blur-sm">
                        <CloudIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold">
                          {t("ascend.cloudLibrary.title") || "Cloud Library"}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                          {t("ascend.cloudLibrary.subtitle") ||
                            "Your games synced to the cloud"}
                        </p>
                      </div>
                    </div>
                    {cloudLibrary?.lastSynced && (
                      <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                        <RefreshCw className="h-3 w-3" />
                        {t("ascend.cloudLibrary.lastSynced")}{" "}
                        {new Date(cloudLibrary.lastSynced).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={handleSyncLibrary}
                    disabled={isSyncingLibrary}
                    className="gap-2 text-secondary shadow-lg"
                    size="lg"
                  >
                    {isSyncingLibrary ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CloudUpload className="h-4 w-4" />
                    )}
                    {isSyncingLibrary
                      ? t("ascend.cloudLibrary.syncing")
                      : t("ascend.cloudLibrary.sync")}
                  </Button>
                </div>
              </div>

              {cloudLibrary && (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-blue-500/10 to-transparent p-5"
                  >
                    <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-blue-500/10 blur-2xl transition-all group-hover:bg-blue-500/20" />
                    <Gamepad2 className="mb-3 h-8 w-8 text-blue-500" />
                    <p className="text-3xl font-bold">{cloudLibrary.totalGames || 0}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("ascend.cloudLibrary.gamesInCloud")}
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-violet-500/10 to-transparent p-5"
                  >
                    <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-violet-500/10 blur-2xl transition-all group-hover:bg-violet-500/20" />
                    <Clock className="mb-3 h-8 w-8 text-violet-500" />
                    <p className="text-3xl font-bold">
                      {formatPlaytimeDetailed(cloudLibrary.totalPlaytime || 0)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("ascend.cloudLibrary.totalPlaytime")}
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-yellow-500/10 to-transparent p-5"
                  >
                    <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-yellow-500/10 blur-2xl transition-all group-hover:bg-yellow-500/20" />
                    <Trophy className="mb-3 h-8 w-8 text-yellow-500" />
                    <div className="flex items-baseline gap-1">
                      <p className="text-3xl font-bold">
                        {cloudLibrary.unlockedAchievements || 0}
                      </p>
                      <p className="text-lg text-muted-foreground">
                        / {cloudLibrary.totalAchievements || 0}
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${achievementPercentage}%` }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                        className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-amber-400"
                      />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {achievementPercentage}
                      {t("ascend.cloudLibrary.percentUnlocked")}
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-emerald-500/10 to-transparent p-5"
                  >
                    <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-emerald-500/10 blur-2xl transition-all group-hover:bg-emerald-500/20" />
                    <Play className="mb-3 h-8 w-8 text-emerald-500" />
                    <p className="text-3xl font-bold">
                      {cloudLibrary.games?.reduce(
                        (acc, g) => acc + (g.launchCount || 0),
                        0
                      ) || 0}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("ascend.cloudLibrary.totalLaunches")}
                    </p>
                  </motion.div>
                </div>
              )}

              {/* Search, Sort, and Filter Bar */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={t("ascend.cloudLibrary.searchPlaceholder")}
                    className="h-12 rounded-xl border-border/50 bg-card/50 pl-11"
                    value={librarySearchQuery}
                    onChange={e => setLibrarySearchQuery(e.target.value)}
                  />
                </div>
                <Select value={librarySortBy} onValueChange={setLibrarySortBy}>
                  <SelectTrigger className="h-12 w-[180px] rounded-xl border-border/50 bg-card/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">
                      {t("ascend.cloudLibrary.sortName")}
                    </SelectItem>
                    <SelectItem value="playtime">
                      {t("ascend.cloudLibrary.sortPlaytime")}
                    </SelectItem>
                    <SelectItem value="recent">
                      {t("ascend.cloudLibrary.sortRecent")}
                    </SelectItem>
                    <SelectItem value="achievements">
                      {t("ascend.cloudLibrary.sortAchievements")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {loadingCloudLibrary ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-4 border-primary/20" />
                    <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-primary" />
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    {t("ascend.cloudLibrary.loading")}
                  </p>
                </div>
              ) : cloudLibrary && filteredGames.length > 0 ? (
                <div className="space-y-3">
                  {filteredGames.map((game, index) => {
                    const gameAchStats = game.achievementStats || game.achievements;
                    const isExpanded = expandedGame === game.name;
                    return (
                      <motion.div
                        key={game.name}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="group overflow-hidden rounded-2xl border border-border/50 bg-card/50 transition-all hover:border-primary/30 hover:shadow-lg"
                      >
                        {/* Main Game Row */}
                        <div
                          className="flex cursor-pointer items-center gap-4 p-4"
                          onClick={() => handleExpandGame(game.name)}
                        >
                          {/* Game Image */}
                          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-muted to-muted/50 shadow-lg">
                            {cloudLibraryImages[game.name] ? (
                              <img
                                src={cloudLibraryImages[game.name]}
                                alt={game.name}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Gamepad2 className="h-8 w-8 text-muted-foreground/50" />
                              </div>
                            )}
                            {gameAchStats?.percentage === 100 && (
                              <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500 shadow-lg">
                                <Trophy className="h-3.5 w-3.5 text-white" />
                              </div>
                            )}
                          </div>

                          {/* Game Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="truncate text-lg font-semibold">
                                {game.name}
                              </h3>
                              {!isGameInstalledLocally(game.name) && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="flex shrink-0 cursor-help items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500">
                                        <CloudOff className="h-3 w-3" />
                                        {t("ascend.cloudLibrary.cloudOnly") ||
                                          "Cloud only"}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-secondary">
                                        {t("ascend.cloudLibrary.storedInCloud") ||
                                          "Stored in the Cloud. Game image not available."}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {game.isCustom && (
                                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  {t("ascend.cloudLibrary.custom")}
                                </span>
                              )}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <Clock className="h-4 w-4 text-violet-500" />
                                {formatPlaytimeDetailed(game.playTime || 0)}
                              </span>
                              {game.launchCount > 0 && (
                                <span className="flex items-center gap-1.5">
                                  <Play className="h-4 w-4 text-emerald-500" />
                                  {game.launchCount} {t("ascend.cloudLibrary.launches")}
                                </span>
                              )}
                              {gameAchStats && (
                                <span className="flex items-center gap-1.5">
                                  <Trophy className="h-4 w-4 text-yellow-500" />
                                  {gameAchStats.unlocked}/{gameAchStats.total} (
                                  {gameAchStats.percentage}%)
                                </span>
                              )}
                            </div>
                            {/* Achievement Progress Bar */}
                            {gameAchStats && (
                              <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-all"
                                  style={{ width: `${gameAchStats.percentage}%` }}
                                />
                              </div>
                            )}
                          </div>

                          {/* Badges & Actions */}
                          <div className="flex shrink-0 items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              {game.favorite && (
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                                  <Star className="h-4 w-4 fill-red-500 text-red-500" />
                                </div>
                              )}
                              {game.online && (
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                                  <Gamepad2 className="h-4 w-4 text-blue-500" />
                                </div>
                              )}
                              {game.dlc && (
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                                  <Gift className="h-4 w-4 text-purple-500" />
                                </div>
                              )}
                            </div>
                            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted">
                              {isExpanded ? (
                                <ChevronUp className="h-5 w-5" />
                              ) : (
                                <ChevronDown className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Expanded Content - Achievements & Actions */}
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-border/50 bg-muted/30"
                          >
                            <div className="space-y-4 p-4">
                              {/* Achievements Section */}
                              {loadingGameAchievements ? (
                                <div className="flex items-center justify-center py-8">
                                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                  <span className="ml-2 text-sm text-muted-foreground">
                                    {t("ascend.cloudLibrary.loadingAchievements")}
                                  </span>
                                </div>
                              ) : gameAchievements?.achievements?.length > 0 ? (
                                <div>
                                  <h4 className="mb-3 flex items-center gap-2 font-semibold">
                                    <Trophy className="h-4 w-4 text-yellow-500" />
                                    {t("ascend.cloudLibrary.achievements")} (
                                    {gameAchievements.unlockedAchievements}/
                                    {gameAchievements.totalAchievements})
                                  </h4>
                                  <div className="grid max-h-64 grid-cols-2 gap-3 overflow-y-auto pr-2 sm:grid-cols-3 md:grid-cols-4">
                                    {gameAchievements.achievements.map((ach, i) => (
                                      <div
                                        key={ach.achID || i}
                                        className={`relative flex flex-col items-center rounded-xl border p-3 transition-all ${
                                          ach.achieved
                                            ? "border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-amber-500/5"
                                            : "border-border/50 bg-muted/50 opacity-60"
                                        }`}
                                      >
                                        {ach.icon ? (
                                          <img
                                            src={ach.icon}
                                            alt={ach.name}
                                            className={`h-10 w-10 rounded-lg ${!ach.achieved && "grayscale"}`}
                                          />
                                        ) : (
                                          <div
                                            className={`flex h-10 w-10 items-center justify-center rounded-lg ${ach.achieved ? "bg-yellow-500/20" : "bg-muted"}`}
                                          >
                                            <Award
                                              className={`h-5 w-5 ${ach.achieved ? "text-yellow-500" : "text-muted-foreground"}`}
                                            />
                                          </div>
                                        )}
                                        <p className="mt-2 line-clamp-2 text-center text-xs font-medium">
                                          {ach.name}
                                        </p>
                                        {!ach.achieved && (
                                          <LockIcon className="absolute right-2 top-2 h-3 w-3 text-muted-foreground" />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : gameAchStats ? (
                                <div className="py-6 text-center text-muted-foreground">
                                  <Trophy className="mx-auto mb-2 h-8 w-8 opacity-50" />
                                  <p className="text-sm">
                                    {t("ascend.cloudLibrary.achievementDetailsNotSynced")}
                                  </p>
                                  <p className="mt-1 text-xs">
                                    {t("ascend.cloudLibrary.syncToLoadAchievements")}
                                  </p>
                                </div>
                              ) : (
                                <div className="py-6 text-center text-muted-foreground">
                                  <Info className="mx-auto mb-2 h-8 w-8 opacity-50" />
                                  <p className="text-sm">
                                    {t("ascend.cloudLibrary.noAchievements")}
                                  </p>
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex items-center justify-between border-t border-border/50 pt-3">
                                <div className="text-xs text-muted-foreground">
                                  {game.lastPlayed && (
                                    <span>
                                      {t("ascend.cloudLibrary.lastPlayed")}:{" "}
                                      {new Date(game.lastPlayed).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {showDeleteConfirm === game.name ? (
                                    <>
                                      <span className="mr-2 text-sm text-muted-foreground">
                                        {t("ascend.cloudLibrary.deleteConfirm")}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowDeleteConfirm(null)}
                                      >
                                        {t("ascend.cloudLibrary.cancel")}
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleDeleteCloudGame(game.name)}
                                        disabled={deletingGame === game.name}
                                      >
                                        {deletingGame === game.name ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          t("ascend.cloudLibrary.delete")
                                        )}
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={e => {
                                        e.stopPropagation();
                                        setShowDeleteConfirm(game.name);
                                      }}
                                    >
                                      <Trash2 className="mr-1 h-4 w-4" />
                                      {t("ascend.cloudLibrary.removeFromCloud")}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              ) : cloudLibrary ? (
                <div className="rounded-2xl border border-border/50 bg-card/50 p-12 text-center">
                  <Search className="mx-auto h-16 w-16 text-muted-foreground/30" />
                  <p className="mt-4 text-lg font-medium">
                    {t("ascend.cloudLibrary.noResults")}
                  </p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                    {librarySearchQuery
                      ? t("ascend.cloudLibrary.tryDifferentSearch")
                      : t("ascend.cloudLibrary.syncFirst")}
                  </p>
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5 p-12 text-center">
                  <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
                  <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
                  <div className="relative">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", delay: 0.1 }}
                      className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/20 shadow-lg"
                    >
                      <CloudIcon className="h-10 w-10 text-primary" />
                    </motion.div>
                    <h2 className="text-2xl font-bold">
                      {t("ascend.cloudLibrary.emptyTitle")}
                    </h2>
                    <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                      {t("ascend.cloudLibrary.emptyDescription")}
                    </p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-violet-500" />
                        {t("ascend.cloudLibrary.playtimeTracking")}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Trophy className="h-4 w-4 text-yellow-500" />
                        {t("ascend.cloudLibrary.achievementSync")}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <CloudIcon className="h-4 w-4 text-blue-500" />
                        {t("ascend.cloudLibrary.cloudBackup")}
                      </span>
                    </div>
                    <Button
                      onClick={handleSyncLibrary}
                      disabled={isSyncingLibrary}
                      size="lg"
                      className="mt-8 gap-2 text-secondary shadow-lg"
                    >
                      {isSyncingLibrary ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <CloudUpload className="h-5 w-5" />
                      )}
                      {isSyncingLibrary
                        ? t("ascend.cloudLibrary.syncing")
                        : t("ascend.cloudLibrary.startSyncing")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );

        case "leaderboard":
          // Load leaderboard data when section is accessed
          if (!leaderboardData && !loadingLeaderboard) {
            loadLeaderboard();
          }

          const formatPlaytimeHours = seconds => {
            const hours = Math.floor(seconds / 3600);
            if (hours < 1) return "<1h";
            if (hours >= 1000) return `${(hours / 1000).toFixed(1)}k h`;
            return `${hours}h`;
          };

          return (
            <div className="mb-24 space-y-8">
              {/* Hero Header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-yellow-500/20 via-amber-500/10 to-orange-500/10 p-8"
              >
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-yellow-500/20 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl" />
                <div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent" />

                <div className="relative flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500 to-amber-600 shadow-xl shadow-yellow-500/30">
                    <Trophy className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold">
                      {t("ascend.leaderboard.title") || "Leaderboard"}
                    </h1>
                    <p className="text-muted-foreground">
                      {t("ascend.leaderboard.subtitle") ||
                        "Top players in the Ascendara community"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadLeaderboard}
                    disabled={loadingLeaderboard}
                    className="ml-auto gap-2"
                  >
                    {loadingLeaderboard ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {t("ascend.leaderboard.refresh") || "Refresh"}
                  </Button>
                </div>
              </motion.div>

              {loadingLeaderboard ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full border-4 border-yellow-500/20" />
                    <div className="absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-yellow-500" />
                  </div>
                  <p className="mt-6 text-muted-foreground">
                    {t("ascend.leaderboard.loading") || "Loading leaderboard..."}
                  </p>
                </div>
              ) : leaderboardData?.topThree?.length > 0 ? (
                <>
                  {/* User Blocked Warning */}
                  {leaderboardData.userBlocked && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/10 to-orange-500/10 p-5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-500/20">
                          <X className="h-6 w-6 text-red-500" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-red-600 dark:text-red-400">
                            You are not eligible for the leaderboard
                          </h3>
                          <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
                            {leaderboardData.userBlockedReason ||
                              "Your account has been restricted from appearing on the leaderboard."}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Top 3 Podium */}
                  <div className="grid grid-cols-3 gap-4 pt-8">
                    {/* 2nd Place */}
                    <motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex flex-col items-center"
                    >
                      {leaderboardData.topThree[1] && (
                        <div
                          onClick={() =>
                            handleViewProfile(leaderboardData.topThree[1].uid)
                          }
                          className="group relative mt-6 w-full cursor-pointer rounded-2xl border border-gray-400/30 bg-gradient-to-b from-gray-400/20 via-gray-400/10 to-transparent p-6 pt-8 transition-all hover:border-gray-400/50 hover:shadow-xl hover:shadow-gray-400/10"
                        >
                          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gray-400/10 blur-2xl transition-all group-hover:bg-gray-400/20" />

                          {/* Rank Badge */}
                          <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gray-300 to-gray-500 text-lg font-bold text-white shadow-lg">
                              2
                            </div>
                          </div>

                          <div className="relative flex flex-col items-center text-center">
                            {/* Avatar */}
                            <div className="relative mb-4">
                              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-gray-300 to-gray-500 shadow-lg ring-4 ring-gray-400/30">
                                {leaderboardData.topThree[1].photoURL ? (
                                  <img
                                    src={leaderboardData.topThree[1].photoURL}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <span className="text-2xl font-bold text-white">
                                    {leaderboardData.topThree[1].displayName?.[0]?.toUpperCase() ||
                                      "U"}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Name & Badges */}
                            <div className="mb-2 flex items-center gap-1">
                              <h3 className="truncate text-lg font-bold">
                                {leaderboardData.topThree[1].displayName}
                              </h3>
                              {leaderboardData.topThree[1].owner && (
                                <Crown className="h-4 w-4 text-yellow-500" />
                              )}
                              {leaderboardData.topThree[1].contributor && (
                                <Hammer className="h-4 w-4 text-orange-500" />
                              )}
                              {leaderboardData.topThree[1].verified && (
                                <BadgeCheck className="h-4 w-4 text-blue-500" />
                              )}
                            </div>

                            {/* Stats */}
                            <div className="mb-3 flex items-center gap-2 rounded-full bg-gray-400/10 px-3 py-1">
                              <Star className="h-4 w-4 text-gray-400" />
                              <span className="text-sm font-semibold">
                                Level {leaderboardData.topThree[1].level}
                              </span>
                            </div>

                            <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Zap className="h-3 w-3 text-yellow-500" />
                                {leaderboardData.topThree[1].xp?.toLocaleString()} XP
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-violet-500" />
                                {formatPlaytimeHours(
                                  leaderboardData.topThree[1].totalPlaytime
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>

                    {/* 1st Place - Center & Elevated */}
                    <motion.div
                      initial={{ opacity: 0, y: 30, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.1 }}
                      className="flex flex-col items-center"
                    >
                      {leaderboardData.topThree[0] && (
                        <div
                          onClick={() =>
                            handleViewProfile(leaderboardData.topThree[0].uid)
                          }
                          className="group relative mt-8 w-full cursor-pointer rounded-2xl border-2 border-yellow-500/50 bg-gradient-to-b from-yellow-500/30 via-amber-500/20 to-orange-500/10 p-6 pt-10 transition-all hover:border-yellow-500/70 hover:shadow-2xl hover:shadow-yellow-500/20"
                        >
                          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-yellow-500/20 blur-3xl transition-all group-hover:bg-yellow-500/30" />
                          <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-amber-500/20 blur-2xl" />

                          {/* Crown & Rank */}
                          <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
                            <div className="relative">
                              <Crown className="absolute -top-4 left-1/2 h-6 w-6 -translate-x-1/2 text-yellow-500" />
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 text-xl font-bold text-white shadow-xl shadow-yellow-500/30">
                                1
                              </div>
                            </div>
                          </div>

                          <div className="relative flex flex-col items-center text-center">
                            {/* Avatar */}
                            <div className="relative mb-4">
                              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 shadow-xl shadow-yellow-500/30 ring-4 ring-yellow-500/50">
                                {leaderboardData.topThree[0].photoURL ? (
                                  <img
                                    src={leaderboardData.topThree[0].photoURL}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <span className="text-3xl font-bold text-white">
                                    {leaderboardData.topThree[0].displayName?.[0]?.toUpperCase() ||
                                      "U"}
                                  </span>
                                )}
                              </div>
                              <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500 shadow-lg">
                                <Trophy className="h-4 w-4 text-white" />
                              </div>
                            </div>

                            {/* Name & Badges */}
                            <div className="mb-2 flex items-center gap-1">
                              <h3 className="truncate text-xl font-bold">
                                {leaderboardData.topThree[0].displayName}
                              </h3>
                              {leaderboardData.topThree[0].owner && (
                                <Crown className="h-5 w-5 text-yellow-500" />
                              )}
                              {leaderboardData.topThree[0].contributor && (
                                <Hammer className="h-5 w-5 text-orange-500" />
                              )}
                              {leaderboardData.topThree[0].verified && (
                                <BadgeCheck className="h-5 w-5 text-blue-500" />
                              )}
                            </div>

                            {/* Stats */}
                            <div className="mb-3 flex items-center gap-2 rounded-full bg-yellow-500/20 px-4 py-1.5">
                              <Star className="h-5 w-5 text-yellow-500" />
                              <span className="font-bold text-yellow-600 dark:text-yellow-400">
                                Level {leaderboardData.topThree[0].level}
                              </span>
                            </div>

                            <div className="flex flex-wrap justify-center gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Zap className="h-4 w-4 text-yellow-500" />
                                {leaderboardData.topThree[0].xp?.toLocaleString()} XP
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4 text-violet-500" />
                                {formatPlaytimeHours(
                                  leaderboardData.topThree[0].totalPlaytime
                                )}
                              </span>
                              <span className="flex items-center gap-1">
                                <Gamepad2 className="h-4 w-4 text-emerald-500" />
                                {leaderboardData.topThree[0].totalGames} games
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>

                    {/* 3rd Place */}
                    <motion.div
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="flex flex-col items-center"
                    >
                      {leaderboardData.topThree[2] && (
                        <div
                          onClick={() =>
                            handleViewProfile(leaderboardData.topThree[2].uid)
                          }
                          className="group relative mt-6 w-full cursor-pointer rounded-2xl border border-amber-700/30 bg-gradient-to-b from-amber-700/20 via-amber-700/10 to-transparent p-6 pt-8 transition-all hover:border-amber-700/50 hover:shadow-xl hover:shadow-amber-700/10"
                        >
                          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-700/10 blur-2xl transition-all group-hover:bg-amber-700/20" />

                          {/* Rank Badge */}
                          <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 to-amber-800 text-lg font-bold text-white shadow-lg">
                              3
                            </div>
                          </div>

                          <div className="relative flex flex-col items-center text-center">
                            {/* Avatar */}
                            <div className="relative mb-4">
                              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600 to-amber-800 shadow-lg ring-4 ring-amber-700/30">
                                {leaderboardData.topThree[2].photoURL ? (
                                  <img
                                    src={leaderboardData.topThree[2].photoURL}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <span className="text-2xl font-bold text-white">
                                    {leaderboardData.topThree[2].displayName?.[0]?.toUpperCase() ||
                                      "U"}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Name & Badges */}
                            <div className="mb-2 flex items-center gap-1">
                              <h3 className="truncate text-lg font-bold">
                                {leaderboardData.topThree[2].displayName}
                              </h3>
                              {leaderboardData.topThree[2].owner && (
                                <Crown className="h-4 w-4 text-yellow-500" />
                              )}
                              {leaderboardData.topThree[2].contributor && (
                                <Hammer className="h-4 w-4 text-orange-500" />
                              )}
                              {leaderboardData.topThree[2].verified && (
                                <BadgeCheck className="h-4 w-4 text-blue-500" />
                              )}
                            </div>

                            {/* Stats */}
                            <div className="mb-3 flex items-center gap-2 rounded-full bg-amber-700/10 px-3 py-1">
                              <Star className="h-4 w-4 text-amber-600" />
                              <span className="text-sm font-semibold">
                                Level {leaderboardData.topThree[2].level}
                              </span>
                            </div>

                            <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Zap className="h-3 w-3 text-yellow-500" />
                                {leaderboardData.topThree[2].xp?.toLocaleString()} XP
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-violet-500" />
                                {formatPlaytimeHours(
                                  leaderboardData.topThree[2].totalPlaytime
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </div>

                  {/* Runner-ups List */}
                  {leaderboardData.runnerUps?.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="space-y-3"
                    >
                      <h2 className="flex items-center gap-2 text-lg font-semibold text-muted-foreground">
                        <Award className="h-5 w-5" />
                        Runner-ups
                      </h2>
                      <div className="space-y-2">
                        {leaderboardData.runnerUps.map((user, index) => (
                          <motion.div
                            key={user.uid}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5 + index * 0.05 }}
                            onClick={() => handleViewProfile(user.uid)}
                            className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-4 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg"
                          >
                            {/* Rank */}
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 font-bold text-muted-foreground">
                              {index + 4}
                            </div>

                            {/* Avatar */}
                            <div className="relative shrink-0">
                              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md">
                                {user.photoURL ? (
                                  <img
                                    src={user.photoURL}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <span className="text-lg font-bold text-white">
                                    {user.displayName?.[0]?.toUpperCase() || "U"}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Info */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <h3 className="truncate font-semibold">
                                  {user.displayName}
                                </h3>
                                {user.owner && (
                                  <Crown className="h-4 w-4 text-yellow-500" />
                                )}
                                {user.contributor && (
                                  <Hammer className="h-4 w-4 text-orange-500" />
                                )}
                                {user.verified && (
                                  <BadgeCheck className="h-4 w-4 text-blue-500" />
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Star className="h-3.5 w-3.5 text-primary" />
                                  Level {user.level}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Zap className="h-3.5 w-3.5 text-yellow-500" />
                                  {user.xp?.toLocaleString()} XP
                                </span>
                              </div>
                            </div>

                            {/* Stats */}
                            <div className="hidden shrink-0 items-center gap-4 text-sm text-muted-foreground sm:flex">
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4 text-violet-500" />
                                {formatPlaytimeHours(user.totalPlaytime)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Gamepad2 className="h-4 w-4 text-emerald-500" />
                                {user.totalGames}
                              </span>
                            </div>

                            <ChevronRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative overflow-hidden rounded-2xl border-2 border-dashed border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 via-transparent to-amber-500/5 p-12 text-center"
                >
                  <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-yellow-500/10 blur-3xl" />
                  <div className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
                  <div className="relative">
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-500/20 shadow-lg">
                      <Trophy className="h-10 w-10 text-yellow-500/50" />
                    </div>
                    <h2 className="text-2xl font-bold">
                      {t("ascend.leaderboard.empty") || "No leaderboard data yet"}
                    </h2>
                    <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                      {t("ascend.leaderboard.emptyDescription") ||
                        "Sync your profile to appear on the leaderboard and compete with other players!"}
                    </p>
                    <Button
                      onClick={() => setActiveSection("home")}
                      className="mt-6 gap-2 text-secondary"
                    >
                      <CloudUpload className="h-4 w-4" />
                      {t("ascend.leaderboard.syncProfile") || "Sync Your Profile"}
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          );

        case "upcoming":
          // Load upcoming changelog when section is accessed
          if (!upcomingChangelog && !loadingUpcoming) {
            loadUpcomingChangelog();
          }

          const upcomingEntry = upcomingChangelog?.[0];

          return (
            <div className="mb-24 space-y-6">
              {loadingUpcoming ? (
                <div className="flex flex-col items-center justify-center py-32">
                  <div className="relative">
                    <div className="h-20 w-20 rounded-full border-4 border-violet-500/20" />
                    <div className="absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-transparent border-t-violet-500" />
                  </div>
                  <p className="mt-6 text-muted-foreground">
                    {t("ascend.upcoming.loading") || "Loading upcoming changes..."}
                  </p>
                </div>
              ) : upcomingEntry ? (
                <>
                  {/* Hero Header with Version Info */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-fuchsia-500/10 p-8"
                  >
                    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
                    <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-purple-500/20 blur-3xl" />
                    <div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />

                    <div className="relative">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-xl shadow-violet-500/30">
                            <Sparkles className="h-8 w-8 text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-3">
                              <h1 className="text-3xl font-bold">
                                {upcomingEntry.title ||
                                  t("ascend.upcoming.title") ||
                                  "Upcoming Update"}
                              </h1>
                              {upcomingEntry.major && (
                                <span className="rounded-full bg-gradient-to-r from-violet-500 to-purple-500 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-violet-500/30">
                                  Major Update
                                </span>
                              )}
                            </div>
                            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="rounded-md bg-violet-500/10 px-2.5 py-1 font-mono text-violet-600 dark:text-violet-400">
                                v{upcomingEntry.version}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Calendar className="h-4 w-4" />
                                {new Date(upcomingEntry.date).toLocaleDateString(
                                  undefined,
                                  {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  }
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={loadUpcomingChangelog}
                          disabled={loadingUpcoming}
                          className="gap-2"
                        >
                          {loadingUpcoming ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          {t("ascend.upcoming.refresh") || "Refresh"}
                        </Button>
                      </div>

                      {upcomingEntry.description && (
                        <p className="mt-4 text-muted-foreground">
                          {upcomingEntry.description}
                        </p>
                      )}
                    </div>
                  </motion.div>

                  {/* Changes Sections - Full Width Stacked */}
                  <div className="space-y-4">
                    {/* Additions */}
                    {upcomingEntry.changes?.additions?.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6"
                      >
                        <div className="mb-4 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                            <Zap className="h-5 w-5 text-emerald-500" />
                          </div>
                          <h2 className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                            {t("ascend.upcoming.additions") || "New Features"}
                          </h2>
                          <span className="ml-auto rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {upcomingEntry.changes.additions.length} new
                          </span>
                        </div>
                        <ul className="grid gap-3 md:grid-cols-2">
                          {upcomingEntry.changes.additions.map((item, i) => {
                            const isObject = typeof item === "object";
                            const text = isObject ? item.change : item;
                            const contributor = isObject ? item.contributor : null;
                            return (
                              <li
                                key={i}
                                className="flex items-start gap-3 rounded-xl bg-background/50 p-3"
                              >
                                <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                                <div className="flex-1">
                                  <span className="text-sm">{text}</span>
                                  {contributor && (
                                    <span className="ml-2 inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                      @{contributor}
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    )}

                    {/* Fixes */}
                    {upcomingEntry.changes?.fixes?.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6"
                      >
                        <div className="mb-4 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                            <Shield className="h-5 w-5 text-amber-500" />
                          </div>
                          <h2 className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                            {t("ascend.upcoming.fixes") || "Bug Fixes"}
                          </h2>
                          <span className="ml-auto rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                            {upcomingEntry.changes.fixes.length} fixed
                          </span>
                        </div>
                        <ul className="grid gap-3 md:grid-cols-2">
                          {upcomingEntry.changes.fixes.map((item, i) => {
                            const isObject = typeof item === "object";
                            const text = isObject ? item.change : item;
                            const contributor = isObject ? item.contributor : null;
                            return (
                              <li
                                key={i}
                                className="flex items-start gap-3 rounded-xl bg-background/50 p-3"
                              >
                                <Check className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                                <div className="flex-1">
                                  <span className="text-sm">{text}</span>
                                  {contributor && (
                                    <span className="ml-2 inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                      @{contributor}
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    )}

                    {/* Improvements */}
                    {upcomingEntry.changes?.improvements?.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6"
                      >
                        <div className="mb-4 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                            <Star className="h-5 w-5 text-blue-500" />
                          </div>
                          <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                            {t("ascend.upcoming.improvements") || "Improvements"}
                          </h2>
                          <span className="ml-auto rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                            {upcomingEntry.changes.improvements.length} improved
                          </span>
                        </div>
                        <ul className="grid gap-3 md:grid-cols-2">
                          {upcomingEntry.changes.improvements.map((item, i) => {
                            const isObject = typeof item === "object";
                            const text = isObject ? item.change : item;
                            const contributor = isObject ? item.contributor : null;
                            return (
                              <li
                                key={i}
                                className="flex items-start gap-3 rounded-xl bg-background/50 p-3"
                              >
                                <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                                <div className="flex-1">
                                  <span className="text-sm">{text}</span>
                                  {contributor && (
                                    <span className="ml-2 inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                                      @{contributor}
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    )}

                    {/* Removals */}
                    {upcomingEntry.changes?.removals?.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6"
                      >
                        <div className="mb-4 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                            <X className="h-5 w-5 text-red-500" />
                          </div>
                          <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">
                            {t("ascend.upcoming.removals") || "Removed"}
                          </h2>
                          <span className="ml-auto rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                            {upcomingEntry.changes.removals.length} removed
                          </span>
                        </div>
                        <ul className="grid gap-3 md:grid-cols-2">
                          {upcomingEntry.changes.removals.map((item, i) => {
                            const isObject = typeof item === "object";
                            const text = isObject ? item.change : item;
                            const contributor = isObject ? item.contributor : null;
                            return (
                              <li
                                key={i}
                                className="flex items-start gap-3 rounded-xl bg-background/50 p-3"
                              >
                                <X className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                                <div className="flex-1">
                                  <span className="text-sm">{text}</span>
                                  {contributor && (
                                    <span className="ml-2 inline-flex items-center rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                                      @{contributor}
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    )}
                  </div>
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-3xl border border-dashed border-border/50 bg-card/30 p-16 text-center"
                >
                  <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500/20 to-purple-500/20">
                    <Check className="h-12 w-12 text-violet-500" />
                  </div>
                  <h2 className="mb-3 text-2xl font-bold">
                    {t("ascend.upcoming.upToDate") || "You're up to date!"}
                  </h2>
                  <p className="mx-auto max-w-md text-muted-foreground">
                    {t("ascend.upcoming.noUpcoming") ||
                      "There are no upcoming updates at this time. Check back later!"}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadUpcomingChangelog}
                    disabled={loadingUpcoming}
                    className="mt-6 gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("ascend.upcoming.refresh") || "Refresh"}
                  </Button>
                </motion.div>
              )}
            </div>
          );

        case "userProfile":
          return (
            <div className="mb-20 space-y-6">
              {/* Back Button */}
              <Button
                variant="ghost"
                onClick={handleBackFromProfile}
                className="-ml-2 gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("ascend.profile.back") || "Back to Search"}
              </Button>

              {loadingProfile ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
                  <p className="text-muted-foreground">
                    {t("ascend.profile.loading") || "Loading profile..."}
                  </p>
                </div>
              ) : profileError ? (
                <div className="border-destructive/50 bg-destructive/10 rounded-2xl border p-8 text-center">
                  <X className="text-destructive mx-auto mb-4 h-12 w-12" />
                  <h3 className="mb-1 text-lg font-semibold">
                    {t("ascend.profile.error") || "Error loading profile"}
                  </h3>
                  <p className="text-sm text-muted-foreground">{profileError}</p>
                </div>
              ) : viewingProfile ? (
                <>
                  {/* Private Account Warning */}
                  {viewingProfile.private && (
                    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-yellow-500/20">
                          <LockIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-yellow-600 dark:text-yellow-400">
                            {t("ascend.profile.privateAccount") || "Private Account"}
                          </h3>
                          <p className="text-sm text-yellow-600/80 dark:text-yellow-400/80">
                            {t("ascend.profile.privateAccountMessage") ||
                              "This user has set their account to private. Their profile details, games, and achievements are hidden."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Profile Header */}
                  <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card/95 to-card/90">
                    {/* Background decoration */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5" />
                    <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary/10 blur-3xl" />
                    <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-violet-500/10 blur-3xl" />

                    <div className="relative p-8">
                      <div className="flex flex-col items-start gap-6 md:flex-row">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 shadow-2xl shadow-primary/30 ring-4 ring-background">
                            {viewingProfile.photoURL ? (
                              <img
                                src={viewingProfile.photoURL}
                                alt={viewingProfile.displayName}
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span className="text-primary-foreground text-4xl font-bold">
                                {viewingProfile.displayName?.[0]?.toUpperCase() || "U"}
                              </span>
                            )}
                          </div>
                          <div
                            className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-4 border-card shadow-lg ${
                              viewingProfile.status === "online"
                                ? "bg-green-500"
                                : viewingProfile.status === "away"
                                  ? "bg-yellow-500"
                                  : viewingProfile.status === "busy"
                                    ? "bg-red-500"
                                    : "bg-gray-500"
                            }`}
                          />
                        </div>

                        {/* User Info */}
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex items-center gap-1">
                            <h1 className="truncate text-3xl font-bold">
                              {viewingProfile.displayName}
                            </h1>
                            {viewingProfile.owner && (
                              <Crown className="mb-2 h-7 w-7 shrink-0 text-yellow-500" />
                            )}
                            {viewingProfile.contributor && (
                              <Hammer className="mb-2 h-7 w-7 shrink-0 text-orange-500" />
                            )}
                            {viewingProfile.verified && (
                              <BadgeCheck className="mb-2 h-7 w-7 shrink-0 text-blue-500" />
                            )}
                          </div>

                          {/* Level Badge & Status - only show if not private */}
                          {!viewingProfile.private && (
                            <div className="mb-3 flex items-center gap-3">
                              <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5">
                                <Star className="h-4 w-4 text-primary" />
                                <span className="text-sm font-semibold text-primary">
                                  Level {viewingProfile.level}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <div
                                  className={`h-2.5 w-2.5 rounded-full ${
                                    viewingProfile.status === "online"
                                      ? "bg-green-500"
                                      : viewingProfile.status === "away"
                                        ? "bg-yellow-500"
                                        : viewingProfile.status === "busy"
                                          ? "bg-red-500"
                                          : "bg-gray-500"
                                  }`}
                                />
                                <span className="capitalize">
                                  {viewingProfile.status === "online"
                                    ? t("ascend.status.online")
                                    : viewingProfile.status === "away"
                                      ? t("ascend.status.away")
                                      : viewingProfile.status === "busy"
                                        ? t("ascend.status.busy")
                                        : t("ascend.status.offline")}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Bio - only show if not private */}
                          {!viewingProfile.private && viewingProfile.bio && (
                            <p className="mb-4 max-w-lg text-muted-foreground">
                              {viewingProfile.bio}
                            </p>
                          )}

                          {/* Country & Socials - only show if not private */}
                          {!viewingProfile.private && (
                            <div className="flex flex-wrap items-center gap-3">
                              {viewingProfile.country && (
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                  <Globe className="h-4 w-4 text-blue-500" />
                                  <span>{viewingProfile.country}</span>
                                </div>
                              )}
                              {viewingProfile.socials?.linkedDiscord && (
                                <div className="flex items-center gap-1.5 rounded-lg bg-[#5865F2]/10 px-2.5 py-1 text-sm">
                                  <svg
                                    className="h-4 w-4 text-[#5865F2]"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                  >
                                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                                  </svg>
                                  <span>{viewingProfile.socials.linkedDiscord}</span>
                                </div>
                              )}
                              {viewingProfile.socials?.epicId && (
                                <div className="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-2.5 py-1 text-sm">
                                  <Gamepad2 className="h-4 w-4" />
                                  <span>{viewingProfile.socials.epicId}</span>
                                </div>
                              )}
                              {viewingProfile.socials?.github && (
                                <div className="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-2.5 py-1 text-sm">
                                  <Github className="h-4 w-4" />
                                  <span>{viewingProfile.socials.github}</span>
                                </div>
                              )}
                              {viewingProfile.socials?.steam && (
                                <div className="flex items-center gap-1.5 rounded-lg bg-[#1b2838]/10 px-2.5 py-1 text-sm">
                                  <Gamepad2 className="h-4 w-4" />
                                  <span>{viewingProfile.socials.steam}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex shrink-0 gap-2">
                          {(() => {
                            const status = getRelationshipStatus(viewingProfile.uid);
                            if (status === "friend") {
                              return (
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    handleStartConversation(viewingProfile.uid)
                                  }
                                  className="gap-2"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                  {t("ascend.profile.message") || "Message"}
                                </Button>
                              );
                            } else if (status === "requestSent") {
                              return (
                                <Button variant="outline" className="gap-2" disabled>
                                  <Clock className="h-4 w-4 text-amber-500" />
                                  {t("ascend.friends.requestPending") || "Pending"}
                                </Button>
                              );
                            } else if (status === "requestReceived") {
                              return (
                                <Button variant="outline" className="gap-2" disabled>
                                  <Inbox className="h-4 w-4 text-blue-500" />
                                  {t("ascend.friends.requestReceived") ||
                                    "Request Received"}
                                </Button>
                              );
                            } else {
                              return (
                                <Button
                                  onClick={() => handleSendRequest(viewingProfile.uid)}
                                  className="gap-2 text-secondary"
                                >
                                  <UserPlus className="h-4 w-4" />
                                  {t("ascend.friends.addFriend")}
                                </Button>
                              );
                            }
                          })()}

                          {/* Report User Button */}
                          <AlertDialog
                            open={reportDialogOpen}
                            onOpenChange={setReportDialogOpen}
                          >
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10"
                              >
                                <Flag className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <form
                                onSubmit={e => {
                                  e.preventDefault();
                                  handleSubmitUserReport();
                                }}
                              >
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-2xl font-bold text-foreground">
                                    {t("ascend.report.title") || "Report User"}:{" "}
                                    {viewingProfile.displayName}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="space-y-4">
                                    <div className="space-y-2">
                                      <label className="text-sm font-medium">
                                        {t("ascend.report.reason") || "Reason"}
                                      </label>
                                      <Select
                                        value={reportUserReason}
                                        onValueChange={setReportUserReason}
                                      >
                                        <SelectTrigger>
                                          <SelectValue
                                            placeholder={
                                              t("ascend.report.selectReason") ||
                                              "Select a reason"
                                            }
                                          />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="inappropriate-content">
                                            {t(
                                              "ascend.report.reasons.inappropriateContent"
                                            ) || "Inappropriate Content"}
                                          </SelectItem>
                                          <SelectItem value="harassment">
                                            {t("ascend.report.reasons.harassment") ||
                                              "Harassment"}
                                          </SelectItem>
                                          <SelectItem value="spam">
                                            {t("ascend.report.reasons.spam") || "Spam"}
                                          </SelectItem>
                                          <SelectItem value="impersonation">
                                            {t("ascend.report.reasons.impersonation") ||
                                              "Impersonation"}
                                          </SelectItem>
                                          <SelectItem value="other">
                                            {t("ascend.report.reasons.other") || "Other"}
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-sm font-medium">
                                        {t("ascend.report.details") || "Details"}
                                      </label>
                                      <Textarea
                                        placeholder={
                                          t("ascend.report.detailsPlaceholder") ||
                                          "Please provide more details about your report..."
                                        }
                                        value={reportUserDetails}
                                        onChange={e =>
                                          setReportUserDetails(e.target.value)
                                        }
                                        className="min-h-[100px]"
                                      />
                                    </div>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>

                                <AlertDialogFooter className="mt-4 gap-2">
                                  <AlertDialogCancel
                                    className="text-primary"
                                    onClick={() => {
                                      setReportUserReason("");
                                      setReportUserDetails("");
                                    }}
                                  >
                                    {t("common.cancel") || "Cancel"}
                                  </AlertDialogCancel>
                                  <Button
                                    type="submit"
                                    className="text-secondary"
                                    disabled={isReportingUser}
                                  >
                                    {isReportingUser ? (
                                      <>
                                        <Loader className="mr-2 h-4 w-4 animate-spin" />
                                        {t("ascend.report.submitting") || "Submitting..."}
                                      </>
                                    ) : (
                                      t("ascend.report.submit") || "Submit Report"
                                    )}
                                  </Button>
                                </AlertDialogFooter>
                              </form>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid - only show if not private */}
                  {!viewingProfile.private && (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div className="rounded-2xl border border-border/50 bg-card/50 p-5">
                        <div className="mb-2 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                            <Clock className="h-5 w-5 text-primary" />
                          </div>
                        </div>
                        <p className="text-2xl font-bold">
                          {Math.floor(viewingProfile.totalPlaytime / 3600)}h
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t("ascend.profile.totalPlaytime") || "Total Playtime"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/50 bg-card/50 p-5">
                        <div className="mb-2 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                            <Gamepad2 className="h-5 w-5 text-violet-500" />
                          </div>
                        </div>
                        <p className="text-2xl font-bold">{viewingProfile.gamesPlayed}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("ascend.profile.gamesPlayed") || "Games Played"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/50 bg-card/50 p-5">
                        <div className="mb-2 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                            <Trophy className="h-5 w-5 text-amber-500" />
                          </div>
                        </div>
                        <p className="text-2xl font-bold">
                          {viewingProfile.unlockedAchievements ||
                            viewingProfile.achievements?.reduce(
                              (acc, game) =>
                                acc +
                                (game.unlockedAchievements ||
                                  game.achievements?.filter(a => a.achieved)?.length ||
                                  0),
                              0
                            ) ||
                            0}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t("ascend.profile.achievements") || "Achievements"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/50 bg-card/50 p-5">
                        <div className="mb-2 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                            <Star className="h-5 w-5 text-emerald-500" />
                          </div>
                        </div>
                        <p className="text-2xl font-bold">
                          {viewingProfile.xp?.toLocaleString() || 0}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t("ascend.profile.totalXP") || "Total XP"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Top Games - only show if not private */}
                  {!viewingProfile.private && viewingProfile.games?.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
                      <div className="flex items-center justify-between border-b border-border/50 p-5">
                        <div className="flex items-center gap-2">
                          <Gamepad2 className="h-5 w-5 text-primary" />
                          <h2 className="font-semibold">
                            {t("ascend.profile.topGames") || "Top Games"}
                          </h2>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {viewingProfile.games.length} games
                        </span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {viewingProfile.games
                          .sort((a, b) => (b.playTime || 0) - (a.playTime || 0))
                          .slice(0, 5)
                          .map((game, index) => (
                            <div
                              key={game.name}
                              className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/30"
                            >
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 text-lg font-bold text-primary">
                                {index + 1}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{game.name}</p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {Math.floor((game.playTime || 0) / 3600)}h{" "}
                                    {Math.floor(((game.playTime || 0) % 3600) / 60)}m
                                  </span>
                                  {game.achievementStats && (
                                    <span className="flex items-center gap-1">
                                      <Trophy className="h-3 w-3" />
                                      {game.achievementStats.unlocked}/
                                      {game.achievementStats.total}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {game.achievementStats && (
                                <div className="text-right">
                                  <p className="text-sm font-medium">
                                    {game.achievementStats.percentage}%
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    complete
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Achievements - only show if not private */}
                  {!viewingProfile.private &&
                    viewingProfile.achievements?.some(g =>
                      g.achievements?.some(a => a.achieved)
                    ) && (
                      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
                        <div className="flex items-center gap-2 border-b border-border/50 p-5">
                          <Trophy className="h-5 w-5 text-amber-500" />
                          <h2 className="font-semibold">
                            {t("ascend.profile.recentAchievements") ||
                              "Recent Achievements"}
                          </h2>
                        </div>
                        <div className="p-5">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {viewingProfile.achievements
                              .flatMap(game =>
                                (game.achievements || [])
                                  .filter(a => a.achieved)
                                  .map(a => ({ ...a, gameName: game.gameName }))
                              )
                              .slice(0, 6)
                              .map((achievement, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-3 rounded-xl bg-muted/30 p-3"
                                >
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                                    <Award className="h-5 w-5 text-amber-500" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                      {achievement.name}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {achievement.gameName}
                                    </p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Empty state if no games */}
                  {(!viewingProfile.games || viewingProfile.games.length === 0) && (
                    <div className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-12 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                        <Gamepad2 className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                      <h3 className="mb-1 text-lg font-semibold">
                        {t("ascend.profile.noGames") || "No games yet"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("ascend.profile.noGamesHint") ||
                          "This user hasn't synced their library yet"}
                      </p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          );

        case "community":
          return (
            <div className="relative h-[calc(100vh-200px)]">
              <CommunityHub user={user} userData={userData} />
            </div>
          );

        case "cloudbackups":
          return (
            <div className="mb-24 space-y-6">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-cyan-500/10 p-6">
                <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-cyan-500/20 blur-3xl" />
                <div className="relative flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-cyan-500 shadow-lg">
                    <Cloud className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">
                      {t("ascend.cloudBackups.title") || "Cloud Backups"}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      {t("ascend.cloudBackups.subtitle") ||
                        "Backup and restore your game saves"}
                    </p>
                  </div>
                </div>
              </div>

              {!ascendAccess.isSubscribed && !ascendAccess.isVerified ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-card/30 py-20">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
                    <Crown className="h-8 w-8 text-amber-500" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">
                    {t("ascend.cloudBackups.subscriptionRequired") ||
                      "Subscription Required"}
                  </h3>
                  <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
                    {t("ascend.cloudBackups.subscriptionRequiredDesc") ||
                      "Cloud backups require an active Ascend subscription. Upgrade to access this feature."}
                  </p>
                  <Button onClick={() => setActiveSection("premium")} className="mt-6">
                    <Crown className="mr-2 h-4 w-4" />
                    {t("ascend.cloudBackups.viewPlans") || "View Plans"}
                  </Button>
                </div>
              ) : (
                <>
                  {/* Backups List */}
                  <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
                    <div className="flex items-center justify-between border-b border-border/50 p-5">
                      <div className="flex items-center gap-2">
                        <Cloud className="h-5 w-5 text-primary" />
                        <h2 className="font-semibold">
                          {t("ascend.cloudBackups.yourBackups") || "Your Backups"}
                        </h2>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadBackups(backupFilterGame || null)}
                        disabled={loadingBackups}
                      >
                        {loadingBackups ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="p-5">
                      <div className="mb-4">
                        <Input
                          placeholder={
                            t("ascend.cloudBackups.filterByGame") ||
                            "Filter by game name..."
                          }
                          value={backupFilterGame}
                          onChange={e => {
                            setBackupFilterGame(e.target.value);
                            loadBackups(e.target.value || null);
                          }}
                        />
                      </div>
                      {loadingBackups ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      ) : backups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <CloudOff className="h-12 w-12 text-muted-foreground/50" />
                          <p className="mt-4 text-sm text-muted-foreground">
                            {t("ascend.cloudBackups.noBackups") || "No backups found"}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Group backups by game */}
                          {Object.entries(
                            backups.reduce((acc, backup) => {
                              const gameName = backup.gameName;
                              if (!acc[gameName]) acc[gameName] = [];
                              acc[gameName].push(backup);
                              return acc;
                            }, {})
                          ).map(([gameName, gameBackups]) => (
                            <div key={gameName} className="space-y-2">
                              {/* Game Header */}
                              <div className="flex items-center gap-2 px-2">
                                <Gamepad2 className="h-4 w-4 text-primary" />
                                <h3 className="font-semibold text-foreground">
                                  {gameName}
                                </h3>
                                <span className="text-xs text-muted-foreground">
                                  ({gameBackups.length} backup
                                  {gameBackups.length !== 1 ? "s" : ""})
                                </span>
                              </div>
                              {/* Backups for this game */}
                              <div className="space-y-2">
                                {gameBackups.map(backup => (
                                  <div
                                    key={backup.backupId}
                                    className="ml-6 flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-4"
                                  >
                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                        <Cloud className="h-4 w-4 text-primary" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">
                                          {backup.backupName}
                                        </p>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                          <span>
                                            {new Date(
                                              backup.createdAt
                                            ).toLocaleDateString()}{" "}
                                            {new Date(
                                              backup.createdAt
                                            ).toLocaleTimeString()}
                                          </span>
                                          {backup.size && backup.size > 0 && (
                                            <>
                                              <span>•</span>
                                              <span>
                                                {(backup.size / 1024 / 1024).toFixed(2)}{" "}
                                                MB
                                              </span>
                                            </>
                                          )}
                                        </div>
                                        <div className="mt-1 flex items-center gap-2">
                                          <span className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 px-2 py-0.5 text-xs font-medium text-white">
                                            <Cloud className="mr-1 inline h-3 w-3" />
                                            Cloud
                                          </span>
                                          {backup.existsLocally && (
                                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                              <FolderSync className="mr-1 inline h-3 w-3" />
                                              Local
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={deletingBackup === backup.backupId}
                                          >
                                            {deletingBackup === backup.backupId ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <Trash2 className="h-4 w-4" />
                                            )}
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>
                                              {t("ascend.cloudBackups.deleteTitle") ||
                                                "Delete Backup?"}
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                              {t("ascend.cloudBackups.deleteDesc") ||
                                                "This will permanently delete this backup from cloud storage. This action cannot be undone."}
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>
                                              {t("common.cancel") || "Cancel"}
                                            </AlertDialogCancel>
                                            <Button
                                              variant="destructive"
                                              onClick={() =>
                                                handleDeleteBackup(backup.backupId)
                                              }
                                            >
                                              {t("common.delete") || "Delete"}
                                            </Button>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );

        case "premium":
          return (
            <div className="mb-24 space-y-6">
              {/* Hero Header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-violet-500/10 p-8"
              >
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
                <div className="absolute left-1/2 top-0 h-px w-1/2 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-600 shadow-xl shadow-primary/30">
                        <Crown className="h-8 w-8 text-white" />
                      </div>
                      <div>
                        <h1 className="text-3xl font-bold">
                          {t("ascend.premium.title") || "Premium Features"}
                        </h1>
                        <p className="mt-2 text-muted-foreground">
                          {t("ascend.premium.subtitle") ||
                            "Unlock the full potential of Ascendara with these exclusive features"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Features Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Friends System */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition-all group-hover:bg-blue-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                      <Users className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.friends.title") || "Friends System"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.friends.description") ||
                        "Send and accept friend requests, build your gaming network, and see when your friends are online. Connect with other Ascendara users and grow your community."}
                    </p>
                  </div>
                </motion.div>
                {/* WebView */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition-all group-hover:bg-blue-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                      <Smartphone className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="mt-4 text-lg font-semibold">
                        {t("ascend.premium.webView.title") || "Game Communities"}
                      </h3>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.webView.description") ||
                        "Find others to play with in game-specific communities. Connect with players who share your interests and coordinate multiplayer sessions."}
                    </p>
                  </div>
                </motion.div>

                {/* Real-Time Chat */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-green-500/10 blur-2xl transition-all group-hover:bg-green-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10 text-green-500">
                      <MessageCircle className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.chat.title") || "Real-Time Chat"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.chat.description") ||
                        "Chat directly with your friends within Ascendara. Share game recommendations, coordinate play sessions, and stay connected with your gaming circle."}
                    </p>
                  </div>
                </motion.div>

                {/* Profile & Bio */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl transition-all group-hover:bg-purple-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
                      <User className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.profile.title") || "Profile & Bio"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.profile.description") ||
                        "Set up your personalized profile with a custom bio, showcase your gaming preferences, and let others know what you're all about. Make your profile uniquely yours."}
                    </p>
                  </div>
                </motion.div>

                {/* Cloud Sync */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-500/10 blur-2xl transition-all group-hover:bg-cyan-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                      <Cloud className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.cloudSync.title") || "Cloud Sync"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.cloudSync.description") ||
                        "Your profile, achievements, and game data are automatically synced to the cloud. Access your complete gaming history from anywhere, on any device."}
                    </p>
                  </div>
                </motion.div>

                {/* Public Leaderboard */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl transition-all group-hover:bg-amber-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                      <Trophy className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.leaderboard.title") || "Public Leaderboard"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.leaderboard.description") ||
                        "Compete with the community on the public leaderboard. See how your stats stack up against other players and climb the ranks."}
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.65 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-500/10 blur-2xl transition-all group-hover:bg-sky-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
                      <CloudUpload className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="mt-4 text-lg font-semibold">
                        {t("ascend.premium.cloudBackups.title") || "Cloud Backups"}
                      </h3>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.cloudBackups.description") ||
                        "Automatically back up your game saves to the cloud. Never lose your progress and restore your saves on any device."}
                    </p>
                  </div>
                </motion.div>

                {/* Auto Game Update Checking */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-indigo-500/10 blur-2xl transition-all group-hover:bg-indigo-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                      <RefreshCw className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.autoUpdate.title") ||
                        "Auto Game Update Checking"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.autoUpdate.description") ||
                        "Automatically check for game updates in the background. Get notified when updates are available and install them with a single click."}
                    </p>
                  </div>
                </motion.div>

                {/* Upcoming Updates Peek */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-violet-500/10 blur-2xl transition-all group-hover:bg-violet-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.upcoming.title") || "Upcoming Updates Peek"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.upcoming.description") ||
                        "Get an exclusive preview of what's coming in the next Ascendara update. Stay ahead of the curve and know what new features are on the horizon."}
                    </p>
                  </div>
                </motion.div>

                {/* Nexus Mod Managing */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-pink-500/10 blur-2xl transition-all group-hover:bg-pink-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pink-500/10 text-pink-500">
                      <Puzzle className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.nexusMods.title") || "Nexus Mod Managing"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.nexusMods.description") ||
                        "Seamlessly manage your Nexus mods for supported games. Browse, install, and organize mods directly within Ascendara."}
                    </p>
                  </div>
                </motion.div>

                {/* Unlimited Downloads */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl transition-all group-hover:bg-emerald-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                      <Infinity className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.unlimitedDownloads.title") ||
                        "Unlimited Downloads"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.unlimitedDownloads.description") ||
                        "Download as many games as you want with no restrictions. Ascend removes all download limits so you can build your library freely."}
                    </p>
                  </div>
                </motion.div>

                {/* FLiNG Trainer */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-orange-500/10 blur-2xl transition-all group-hover:bg-orange-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                      <Zap className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.flingTrainer.title") || "FLiNG Trainer"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.flingTrainer.description") ||
                        "Automatically downloads the correct FLiNG trainer for your game and handles installation, no manual searching or setup required."}
                    </p>
                  </div>
                </motion.div>

                {/* Download Queue */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-teal-500/10 blur-2xl transition-all group-hover:bg-teal-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500">
                      <ListOrdered className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.downloadQueue.title") || "Download Queue"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.downloadQueue.description") ||
                        "Queue multiple downloads and let Ascendara handle them automatically. Start downloads and come back when they're all ready."}
                    </p>
                  </div>
                </motion.div>

                {/* Game Communities - PLANNED */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-rose-500/10 blur-2xl transition-all group-hover:bg-rose-500/20" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
                      <Gamepad2 className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="mt-4 text-lg font-semibold">
                        {t("ascend.premium.communities.title") || "Game Communities"}
                      </h3>
                      <span className="mt-4 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                        {t("ascend.premium.planned") || "PLANNED"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.communities.description") ||
                        "Find others to play with in game-specific communities. Connect with players who share your interests and coordinate multiplayer sessions."}
                    </p>
                  </div>
                </motion.div>

                {/* And More Coming */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="group relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-violet-500/5 p-6 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/20 blur-2xl transition-all group-hover:bg-primary/30" />
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">
                      {t("ascend.premium.moreComing.title") || "And More Coming"}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("ascend.premium.moreComing.description") ||
                        "There are constantly new features for Ascend subscribers. Your subscription helps fund development of exciting new capabilities."}
                    </p>
                  </div>
                </motion.div>
              </div>
            </div>
          );

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
              {renderContent()}
            </motion.div>
          </div>
        </div>

        {/* Subscription Plan Selection Dialog */}
        <AlertDialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-2xl">
                <Crown className="h-6 w-6 text-primary" />
                {t("ascend.settings.subscriptionDialog.title")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("ascend.settings.subscriptionDialog.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="grid gap-4 py-4 sm:grid-cols-3">
              {availablePlans.map(plan => {
                const isMonthly = plan.intervalCount === 1;
                const is3Month = plan.intervalCount === 3;
                const is6Month = plan.intervalCount === 6;
                const totalPrice = plan.unitAmount / 100;
                const pricePerMonth = (totalPrice / plan.intervalCount).toFixed(2);
                const savings = is3Month ? "17%" : is6Month ? "25%" : null;

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`relative flex cursor-pointer flex-col rounded-xl border-2 transition-all hover:scale-105 hover:shadow-lg ${
                      is6Month
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/50"
                    }`}
                    onClick={() => handlePlanSelection(plan.id)}
                  >
                    {savings && (
                      <div className="absolute -right-2 -top-2 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-secondary shadow-lg">
                        {t("ascend.settings.subscriptionDialog.saveText")} {savings}
                      </div>
                    )}

                    <div className="flex-1 space-y-3 p-4">
                      <div className="text-center">
                        <h3 className="text-lg font-bold">
                          {plan.intervalCount}{" "}
                          {plan.intervalCount > 1
                            ? t("ascend.settings.subscriptionDialog.months")
                            : t("ascend.settings.subscriptionDialog.month")}
                        </h3>
                        {is6Month && (
                          <p className="text-xs font-semibold text-primary">
                            {t("ascend.settings.subscriptionDialog.bestValue")}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1 text-center">
                        <div className="flex items-baseline justify-center gap-1">
                          <span className="text-3xl font-bold">${totalPrice}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {plan.intervalCount > 1
                            ? `$${pricePerMonth}${t("ascend.settings.subscriptionDialog.perMonth")} - ${t("ascend.settings.subscriptionDialog.billedEvery", { count: plan.intervalCount })}`
                            : t("ascend.settings.subscriptionDialog.billedMonthly")}
                        </p>
                      </div>

                      <div className="space-y-2 text-center">
                        <div className="text-xs text-muted-foreground">
                          {t("ascend.settings.subscriptionDialog.allPlansInclude")}
                        </div>
                        {savings && (
                          <div className="flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 font-bold text-primary">
                            <Sparkles className="h-4 w-4" />
                            <span className="text-sm">
                              {t("ascend.settings.subscriptionDialog.save", {
                                percent: savings,
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className={`rounded-b-xl border-t py-3 text-center text-sm font-semibold ${
                        is6Month
                          ? "border-primary/20 bg-primary text-secondary"
                          : "border-border bg-muted text-foreground"
                      }`}
                    >
                      {t("ascend.settings.subscriptionDialog.selectPlan")}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("ascend.settings.subscriptionDialog.cancel")}
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Sign up / Login form - open two-column layout
  return (
    <div className="container mx-auto flex min-h-[80vh] max-w-5xl items-center px-6 py-8">
      <div className="grid w-full items-center gap-12 lg:grid-cols-2 lg:gap-20">
        {/* Left side - Branding & Features Showcase */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2.5 rounded-full bg-primary/10 px-4 py-1.5"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                {isLogin ? t("account.welcomeBack") : t("account.setUp")}
              </span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-4xl font-bold tracking-tight lg:text-5xl"
            >
              {isLogin ? t("account.loginSubtitle") : t("account.joinAscend")}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="text-base text-muted-foreground"
            >
              {isLogin ? t("account.welcomeBackIntro") : t("account.featuresIntro")}
            </motion.p>
          </div>

          {/* Premium Features Showcase */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-4"
          >
            {/* Top 3 Hero Features */}
            <div className="space-y-3">
              {/* Cloud Sync */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="group relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/20 via-cyan-600/10 to-transparent p-5"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 ring-1 ring-cyan-500/30">
                    <Cloud className="h-6 w-6 text-cyan-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-foreground">
                      {t("account.features.cloudSyncandBackups")}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("account.features.cloudSyncandBackupsDesc")}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Two Column - Mobile View & Profiles */}
              <div className="grid grid-cols-2 gap-3">
                {/* Mobile View & Remote Access */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                  className="group relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/20 to-amber-600/10 p-4"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative flex flex-col gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 ring-1 ring-amber-500/30">
                      <Smartphone className="h-5 w-5 text-amber-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">
                        {t("account.features.mobileView")}
                      </h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("account.features.mobileViewDesc")}
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Profiles */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.45 }}
                  className="group relative overflow-hidden rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/20 to-purple-600/10 p-4"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative flex flex-col gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20 ring-1 ring-purple-500/30">
                      <User className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">
                        {t("account.features.profiles")}
                      </h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("account.features.profilesDesc")}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Two Column - Auto Updates & Download Queues */}
            <div className="grid grid-cols-2 gap-3">
              {/* Auto Updates */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
                className="group relative overflow-hidden rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/20 to-orange-600/10 p-4"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative flex flex-col gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20 ring-1 ring-orange-500/30">
                    <Zap className="h-5 w-5 text-orange-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">
                      {t("account.features.autoUpdate")}
                    </h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("account.features.autoUpdateDesc")}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Download Queues */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.55 }}
                className="group relative overflow-hidden rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 p-4"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative flex flex-col gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/30">
                    <ListOrdered className="h-5 w-5 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">
                      {t("account.features.downloadQueues")}
                    </h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("account.features.downloadQueuesDesc")}
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Additional Features Grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  icon: UserPlus,
                  labelKey: "account.features.friends",
                  bgClass: "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/15",
                  iconClass: "text-blue-400",
                },
                {
                  icon: MessageCircle,
                  labelKey: "account.features.chat",
                  bgClass: "bg-green-500/10 border-green-500/20 hover:bg-green-500/15",
                  iconClass: "text-green-400",
                },
                {
                  icon: Trophy,
                  labelKey: "account.features.leaderboard",
                  bgClass: "bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/15",
                  iconClass: "text-yellow-400",
                },
                {
                  icon: Infinity,
                  labelKey: "account.features.unlimitedDownloads",
                  bgClass: "bg-violet-500/10 border-violet-500/20 hover:bg-violet-500/15",
                  iconClass: "text-violet-400",
                },
                {
                  icon: Puzzle,
                  labelKey: "account.features.nexusMods",
                  bgClass:
                    "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15",
                  iconClass: "text-emerald-400",
                },
                {
                  icon: Zap,
                  labelKey: "account.features.trainers",
                  bgClass: "bg-pink-500/10 border-pink-500/20 hover:bg-pink-500/15",
                  iconClass: "text-pink-400",
                },
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.03 }}
                  className={`group relative overflow-hidden rounded-lg border p-3 transition-colors ${feature.bgClass}`}
                >
                  <div className="flex flex-col items-center gap-2 text-center">
                    <feature.icon className={`h-4 w-4 ${feature.iconClass}`} />
                    <span className="text-xs font-medium">{t(feature.labelKey)}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Coming Soon Banner */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t("account.features.moreComing")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("account.features.moreComingDesc")}
                </p>
              </div>
            </motion.div>
          </motion.div>

          {/* Pricing notice - only on signup */}
          {!isLogin && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5"
            >
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
              <div className="relative flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
                  <Gift className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-primary">
                    {t("account.pricingFriendly")}
                  </span>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t("account.pricingDetails")}{" "}
                    <a
                      onClick={() =>
                        window.electron.openURL("https://ascendara.app/ascend?ref=app")
                      }
                      className="inline-flex cursor-pointer items-center text-primary hover:underline"
                    >
                      {t("common.learnMore")}
                      <ExternalLink className="ml-1 inline-block h-3 w-3" />
                    </a>
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Right side - Form */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative w-full max-w-lg justify-self-end"
        >
          {/* Glassmorphism card container */}
          <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 p-6 shadow-2xl backdrop-blur-xl">
            {/* Decorative gradient orbs */}
            <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />

            <div className="relative space-y-5">
              {/* Account Already Exists Error */}
              {accountExistsError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border-destructive/30 bg-destructive/10 rounded-xl border p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-destructive/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                      <Shield className="text-destructive h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-destructive text-sm font-semibold">
                        {accountExistsError.isDeleted
                          ? t("account.errors.cannotCreateAccount") ||
                            "Cannot Create Account"
                          : t("account.errors.accountExists")}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {accountExistsError.isDeleted
                          ? t("account.errors.deletedAccountMessage") ||
                            "This device is associated with a deleted account. You cannot create another account. Please contact support for assistance."
                          : accountExistsError.email
                            ? t("account.errors.accountExistsWithEmail", {
                                email: accountExistsError.email,
                              })
                            : t("account.errors.accountExistsNoEmail")}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {!accountExistsError.isDeleted && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setAccountExistsError(null);
                              setIsLogin(true);
                            }}
                          >
                            {t("account.errors.signInInstead")}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() =>
                            window.electron?.openURL("https://discord.gg/ascendara")
                          }
                        >
                          {t("account.errors.getSupport")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Deleted Account Warning */}
              {deletedAccountWarning && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border-destructive/30 bg-destructive/10 rounded-xl border p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-destructive/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                      <Shield className="text-destructive h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-destructive text-sm font-semibold">
                        {t("account.errors.accountDeleted")}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t("account.errors.accountDeletedMessage")}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() =>
                            window.electron?.openURL("https://discord.gg/ascendara")
                          }
                        >
                          {t("account.errors.getSupport")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setDeletedAccountWarning(false)}
                        >
                          {t("common.dismiss")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Checkboxes - only on signup (moved to top) */}
              <AnimatePresence mode="wait">
                {!isLogin && (
                  <motion.div
                    key="checkboxes"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2 rounded-lg border border-border/30 bg-muted/30 p-3"
                  >
                    {/* Terms checkbox */}
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="terms"
                        checked={agreedToTerms}
                        onCheckedChange={setAgreedToTerms}
                        disabled={isSubmitting}
                        className="mt-2 h-4 w-4 shrink-0 cursor-pointer data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                      />
                      <label
                        htmlFor="terms"
                        className="cursor-pointer text-xs leading-relaxed text-muted-foreground"
                      >
                        {t("account.form.termsPrefix")}{" "}
                        <button
                          type="button"
                          onClick={() =>
                            window.electron?.openURL("https://ascendara.app/ascend/terms")
                          }
                          className="font-medium text-primary hover:underline"
                        >
                          {t("account.form.termsLink")}
                        </button>{" "}
                        {t("account.form.termsAnd")}{" "}
                        <button
                          type="button"
                          onClick={() =>
                            window.electron?.openURL(
                              "https://ascendara.app/ascend/privacy"
                            )
                          }
                          className="font-medium text-primary hover:underline"
                        >
                          {t("account.form.privacyLink")}
                        </button>
                      </label>
                    </div>

                    {/* Link with PC checkbox */}
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="linkpc"
                        checked={linkWithPC}
                        onCheckedChange={setLinkWithPC}
                        disabled={isSubmitting}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                      />
                      <label
                        htmlFor="linkpc"
                        className="cursor-pointer text-xs leading-relaxed text-muted-foreground"
                      >
                        {t("account.form.linkWithPC")}{" "}
                        <a
                          onClick={() =>
                            window.electron?.openURL(
                              "https://ascendara.app/docs/features/ascend#privacy,-security-&-abuse-prevention"
                            )
                          }
                          className="inline-flex cursor-pointer items-center text-[10px] font-medium text-primary hover:underline"
                        >
                          {t("common.learnMore")}
                          <ExternalLink className="ml-0.5 h-2.5 w-2.5" />
                        </a>
                      </label>
                    </div>

                    {/* Free trial checkbox */}
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="freetrial"
                        checked={startFreeTrial}
                        onCheckedChange={setStartFreeTrial}
                        disabled={isSubmitting}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                      />
                      <label
                        htmlFor="freetrial"
                        className="cursor-pointer text-xs leading-relaxed text-muted-foreground"
                      >
                        {t("ascend.access.trial")}
                      </label>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Google Sign In */}
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full gap-2 rounded-xl border-border/50 bg-background/50 transition-all hover:bg-background/80 hover:shadow-md disabled:opacity-50"
                onClick={handleGoogleSignIn}
                disabled={
                  isGoogleLoading ||
                  isSubmitting ||
                  (!isLogin && (!agreedToTerms || !linkWithPC || !startFreeTrial))
                }
              >
                {isGoogleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon className="h-4 w-4" />
                )}
                <span className="text-sm">{t("account.form.continueWithGoogle")}</span>
              </Button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card/80 px-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("account.form.orContinueWith")}
                  </span>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Display Name - only on signup */}
                <AnimatePresence mode="wait">
                  {!isLogin && (
                    <motion.div
                      key="displayName"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="displayName" className="text-xs font-medium">
                          {t("account.form.displayName")}
                        </Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="displayName"
                            name="displayName"
                            type="text"
                            placeholder={t("account.form.displayNamePlaceholder")}
                            value={formData.displayName}
                            onChange={handleInputChange}
                            className="h-9 rounded-lg border-border/50 bg-background/50 pl-9 text-sm transition-all focus:bg-background focus:shadow-md"
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium">
                    {t("account.form.email")}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder={t("account.form.emailPlaceholder")}
                      value={formData.email}
                      onChange={handleInputChange}
                      className="h-9 rounded-lg border-border/50 bg-background/50 pl-9 text-sm transition-all focus:bg-background focus:shadow-md"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                {/* Password fields in a row for signup */}
                <AnimatePresence mode="wait">
                  {!isLogin ? (
                    <motion.div
                      key="passwordRow"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="grid grid-cols-2 gap-3"
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="password" className="text-xs font-medium">
                          {t("account.form.password")}
                        </Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={handleInputChange}
                            className="h-9 rounded-lg border-border/50 bg-background/50 pl-9 pr-9 text-sm transition-all focus:bg-background focus:shadow-md"
                            disabled={isSubmitting}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {showPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="confirmPassword" className="text-xs font-medium">
                          {t("account.form.confirmPassword")}
                        </Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="confirmPassword"
                            name="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="••••••••"
                            value={formData.confirmPassword}
                            onChange={handleInputChange}
                            className="h-9 rounded-lg border-border/50 bg-background/50 pl-9 pr-9 text-sm transition-all focus:bg-background focus:shadow-md"
                            disabled={isSubmitting}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="passwordSingle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="password" className="text-xs font-medium">
                          {t("account.form.password")}
                        </Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder={t("account.form.passwordPlaceholder")}
                            value={formData.password}
                            onChange={handleInputChange}
                            className="h-9 rounded-lg border-border/50 bg-background/50 pl-9 pr-9 text-sm transition-all focus:bg-background focus:shadow-md"
                            disabled={isSubmitting}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {showPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit button */}
                <Button
                  type="submit"
                  className="h-10 w-full rounded-xl text-sm font-medium text-secondary shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30"
                  disabled={
                    isSubmitting ||
                    isGoogleLoading ||
                    (!isLogin && (!agreedToTerms || !linkWithPC || !startFreeTrial))
                  }
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  {isLogin ? t("account.form.signIn") : t("account.form.createAccount")}
                </Button>
              </form>

              {/* Footer links */}
              <div className="space-y-1 pt-2 text-center">
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  {isLogin ? t("account.noAccount") : t("account.haveAccount")}
                </button>
                {isLogin && (
                  <p>
                    <button
                      type="button"
                      onClick={() =>
                        window.electron?.openURL("https://ascendara.app/discord")
                      }
                      className="text-xs text-muted-foreground transition-colors hover:text-primary"
                    >
                      {t("account.forgotPassword")}
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Email Confirmation Dialog */}
      <AlertDialog open={showEmailConfirmDialog} onOpenChange={setShowEmailConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              {t("account.confirmEmail.title") || "Confirm Your Email"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">
                  {t("account.confirmEmail.message") ||
                    "Please confirm that your email address is correct. Once your account is created, you will NOT be able to change your email address."}
                </p>
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("account.confirmEmail.emailLabel") || "Email Address:"}
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                    {pendingSignupData?.email}
                  </p>
                </div>
                <p className="text-destructive text-xs">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  {t("account.confirmEmail.warning") ||
                    "This email cannot be changed after account creation!"}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowEmailConfirmDialog(false);
                setPendingSignupData(null);
              }}
            >
              {t("account.confirmEmail.goBack") || "Go Back & Edit"}
            </AlertDialogCancel>
            <Button
              onClick={handleConfirmSignup}
              disabled={isSubmitting}
              className="text-secondary"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("account.confirmEmail.creating") || "Creating Account..."}
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {t("account.confirmEmail.confirm") || "Yes, Create Account"}
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Ascend;
