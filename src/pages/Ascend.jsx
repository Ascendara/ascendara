import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
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
  deleteNewAccount,
  registerHardwareId,
  syncCloudLibrary,
  getCloudLibrary,
  syncGameAchievements,
  getGameAchievements,
  getAllGameAchievements,
  deleteCloudGame,
  getUserPublicProfile,
} from "@/services/firebaseService";
import {
  User,
  Users,
  Mail,
  Lock,
  Eye,
  EyeOff,
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
  BarChart3,
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
  AtSign,
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
    error,
    clearError,
  } = useAuth();

  const [isLogin, setIsLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showDisplayNamePrompt, setShowDisplayNamePrompt] = useState(false);
  const [googleDisplayName, setGoogleDisplayName] = useState("");
  const [activeSection, setActiveSection] = useState("home");
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [accountExistsError, setAccountExistsError] = useState(null); // { email: string | null }

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
  const [editGithub, setEditGithub] = useState("");
  const [editSteam, setEditSteam] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // User status state
  const [userStatus, setUserStatus] = useState("online");

  // Ascend access state (server-verified)
  const [ascendAccess, setAscendAccess] = useState({
    hasAccess: true,
    daysRemaining: 7,
    isSubscribed: false,
    isVerified: false,
    verified: false,
  });
  const [verifyingAccess, setVerifyingAccess] = useState(true);
  const [showSubscriptionSuccess, setShowSubscriptionSuccess] = useState(false);

  // Messaging state
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

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

  // Report user state
  const [isReportingUser, setIsReportingUser] = useState(false);
  const [reportUserReason, setReportUserReason] = useState("");
  const [reportUserDetails, setReportUserDetails] = useState("");
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [profileError, setProfileError] = useState(null);

  // Verify Ascend access and load data when user is logged in
  useEffect(() => {
    if (user?.uid && !showDisplayNamePrompt) {
      verifyAccess();
      loadFriendsData();
      loadRequestsData();
      loadUserStatus();
      loadConversations();
      loadProfileStats();
      loadLocalStats();
      loadCloudLibrary();
    }
  }, [user?.uid, showDisplayNamePrompt]);

  // Calculate profile statistics based on games data (same logic as Profile.jsx)
  const calculateProfileStats = (games, customGames) => {
    const allGames = [...(games || []), ...(customGames || [])];

    let totalXP = 0;
    let totalPlaytime = 0;

    allGames.forEach(game => {
      let gameXP = 100;
      const playtimeHours = (game.playTime || 0) / 3600;
      gameXP += Math.floor(playtimeHours * 50);
      gameXP += Math.min((game.launchCount || 0) * 10, 100);
      if (game.completed) gameXP += 150;
      totalXP += gameXP;
      totalPlaytime += game.playTime || 0;
    });

    const totalPlaytimeHours = totalPlaytime / 3600;
    if (totalPlaytimeHours >= 25) totalXP += 100;
    if (totalPlaytimeHours >= 50) totalXP += 200;
    if (totalPlaytimeHours >= 100) totalXP += 300;
    if (totalPlaytimeHours >= 200) totalXP += 500;
    if (totalPlaytimeHours >= 500) totalXP += 1000;

    const baseXP = 50;
    let level = Math.max(1, Math.floor(1 + Math.sqrt(totalXP / baseXP) * 1.5));
    level = Math.min(level, 999);

    const xpForCurrentLevel = level <= 1 ? 0 : baseXP * Math.pow(level, 2);
    const xpForNextLevel = baseXP * Math.pow(level + 1, 2);
    const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
    const currentLevelProgress = Math.max(0, totalXP - xpForCurrentLevel);

    if (level >= 999) {
      return {
        totalPlaytime,
        gamesPlayed: allGames.filter(game => game.playTime > 0).length,
        totalGames: allGames.length,
        level: 999,
        xp: totalXP,
        currentXP: 100,
        nextLevelXp: 100,
        allGames,
      };
    }

    return {
      totalPlaytime,
      gamesPlayed: allGames.filter(game => game.playTime > 0).length,
      totalGames: allGames.length,
      level,
      xp: totalXP,
      currentXP: currentLevelProgress,
      nextLevelXp: xpNeededForNextLevel,
      allGames,
    };
  };

  // Load local stats from Electron
  const loadLocalStats = async () => {
    setLoadingLocalStats(true);
    try {
      const games = (await window.electron?.getGames?.()) || [];
      const customGames = (await window.electron?.getCustomGames?.()) || [];
      const stats = calculateProfileStats(games, customGames);

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
    } catch (e) {
      console.error("Failed to verify Ascend access:", e);
      // Default to allowing access on error (fail open for better UX)
      setAscendAccess({
        hasAccess: true,
        daysRemaining: 7,
        isSubscribed: false,
        isVerified: false,
        trialBlocked: false,
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
      const allGames = [...games, ...customGames];

      // Calculate stats (same logic as Profile.jsx)
      let totalXP = 0;
      let totalPlaytime = 0;

      allGames.forEach(game => {
        let gameXP = 100;
        const playtimeHours = (game.playTime || 0) / 3600;
        gameXP += Math.floor(playtimeHours * 50);
        gameXP += Math.min((game.launchCount || 0) * 10, 100);
        if (game.completed) gameXP += 150;
        totalXP += gameXP;
        totalPlaytime += game.playTime || 0;
      });

      const totalPlaytimeHours = totalPlaytime / 3600;
      if (totalPlaytimeHours >= 25) totalXP += 100;
      if (totalPlaytimeHours >= 50) totalXP += 200;
      if (totalPlaytimeHours >= 100) totalXP += 300;
      if (totalPlaytimeHours >= 200) totalXP += 500;
      if (totalPlaytimeHours >= 500) totalXP += 1000;

      const baseXP = 50;
      let level = Math.max(1, Math.floor(1 + Math.sqrt(totalXP / baseXP) * 1.5));
      level = Math.min(level, 999);

      const profileData = {
        level,
        xp: totalXP,
        totalPlaytime,
        gamesPlayed: allGames.filter(g => g.playTime > 0).length,
        totalGames: allGames.length,
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

  const handleSelectConversation = async conversation => {
    setSelectedConversation(conversation);
    setLoadingMessages(true);
    try {
      const result = await getMessages(conversation.id);
      if (!result.error) {
        setMessages(result.messages);
      }
      // Mark messages as read
      await markMessagesAsRead(conversation.id);
      // Update unread count in conversations list
      setConversations(prev =>
        prev.map(c => (c.id === conversation.id ? { ...c, unreadCount: 0 } : c))
      );
    } catch (e) {
      console.error("Failed to load messages:", e);
    }
    setLoadingMessages(false);
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation) return;
    setSendingMessage(true);
    try {
      const result = await sendMessage(selectedConversation.id, messageInput);
      if (result.success) {
        setMessageInput("");
        // Reload messages
        const messagesResult = await getMessages(selectedConversation.id);
        if (!messagesResult.error) {
          setMessages(messagesResult.messages);
        }
        // Update conversation in list
        loadConversations();
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
        // Reload conversations and select the new one
        await loadConversations();
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
      setSearchResults(result.users);
    } else {
      toast.error(result.error);
    }
    setIsSearching(false);
  };

  const handleSendRequest = async toUid => {
    const result = await sendFriendRequest(toUid);
    if (result.success) {
      toast.success(t("ascend.friends.requestSent"));
      loadRequestsData();
      // Remove from search results
      setSearchResults(prev => prev.filter(u => u.uid !== toUid));
    } else {
      toast.error(result.error);
    }
  };

  // View a user's public profile
  const handleViewProfile = async userId => {
    setLoadingProfile(true);
    setProfileError(null);
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
    setActiveSection("search");
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
    setEditDiscord(userData?.socials?.discord || "");
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
        discord: editDiscord.trim(),
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
    setEditGithub("");
    setEditSteam("");
  };

  // Subscribe to Ascend via Stripe Checkout
  const handleSubscribe = async () => {
    try {
      const productResponse = await fetch(
        "https://api.ascendara.app/stripe/products/prod_TZdRiUAwPpMEjW"
      );
      if (!productResponse.ok) {
        toast.error(t("ascend.settings.checkoutError"));
        return;
      }
      const product = await productResponse.json();

      // Get the first price (monthly subscription)
      const priceId = product.prices?.[0]?.id;
      if (!priceId) {
        toast.error(t("ascend.settings.checkoutError"));
        return;
      }

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
    setIsGoogleLoading(true);
    setAccountExistsError(null);

    // Check if this hardware already has an account (only for new signups)
    let hardwareId = null;
    if (window.electron?.getHardwareId) {
      hardwareId = await window.electron.getHardwareId();
    }

    const result = await googleSignIn();
    if (result.user) {
      if (result.isNewUser) {
        // Check if hardware ID already has an account
        if (hardwareId) {
          const hwCheck = await checkHardwareIdAccount(hardwareId);
          if (hwCheck.hasAccount) {
            // Delete the newly created account and show error
            await deleteNewAccount();
            setAccountExistsError({ email: hwCheck.email });
            setIsGoogleLoading(false);
            return;
          }
          // Register the hardware ID for this new user
          await registerHardwareId(hardwareId, result.user.uid);
        }
        // New user - prompt for display name
        setGoogleDisplayName(result.user.displayName || "");
        setShowDisplayNamePrompt(true);
      } else {
        toast.success(t("account.success.loggedIn"));
      }
    } else if (result.error) {
      toast.error(result.error);
    }
    setIsGoogleLoading(false);
  };

  const handleDisplayNameSubmit = async () => {
    if (googleDisplayName.trim().length < 4) {
      toast.error(t("account.errors.displayNameTooShort"));
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

      // Check if this hardware already has an account
      let hardwareId = null;
      if (window.electron?.getHardwareId) {
        hardwareId = await window.electron.getHardwareId();
      }
      if (hardwareId) {
        const hwCheck = await checkHardwareIdAccount(hardwareId);
        if (hwCheck.hasAccount) {
          setAccountExistsError({ email: hwCheck.email });
          setIsSubmitting(false);
          return;
        }
      }

      // Pass hardware ID to register so it gets linked to the account
      const result = await register(
        formData.email,
        formData.password,
        formData.displayName,
        hardwareId
      );
      if (result.user) {
        toast.success(t("account.success.registered"));
      } else if (result.error) {
        toast.error(result.error);
      }
    } else {
      // Login
      const result = await login(formData.email, formData.password);
      if (result.user) {
        toast.success(t("account.success.loggedIn"));
      } else if (result.error) {
        toast.error(result.error);
      }
    }

    setIsSubmitting(false);
  };

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      toast.success(t("account.success.loggedOut"));
    }
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

            <Button
              onClick={handleLogout}
              variant="ghost"
              className="h-11 w-full text-muted-foreground"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t("account.verification.useAnother")}
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
      return (
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
            <Button onClick={handleSubscribe} className="w-full text-secondary">
              <BadgeDollarSign className="mr-2 h-4 w-4" />
              {t("ascend.settings.subscribe")}
            </Button>
            <button
              onClick={handleLogout}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t("account.signOut")}
            </button>
          </div>
        </div>
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
                              {result.level > 1 && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  Lv. {result.level}
                                </span>
                              )}
                            </div>

                            {/* Bio */}
                            {result.bio && (
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
                              {result.totalPlaytime > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>
                                    {Math.floor(result.totalPlaytime / 3600)}h played
                                  </span>
                                </div>
                              )}
                              {result.gamesPlayed > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Gamepad2 className="h-3.5 w-3.5" />
                                  <span>{result.gamesPlayed} games</span>
                                </div>
                              )}
                              {result.country && (
                                <div className="flex items-center gap-1.5">
                                  <Globe className="h-3.5 w-3.5" />
                                  <span>{result.country}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex shrink-0 items-center gap-2">
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
          return (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold">
                {t("ascend.friends.title")} ({friends.length})
              </h1>

              {loadingFriends ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : friends.length > 0 ? (
                <div className="space-y-2">
                  {friends.map(friend => (
                    <div
                      key={friend.uid}
                      className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
                            <span className="text-primary-foreground text-sm font-bold">
                              {friend.displayName?.[0]?.toUpperCase() || "U"}
                            </span>
                          </div>
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${
                              friend.status === "online"
                                ? "bg-green-500"
                                : friend.status === "away"
                                  ? "bg-yellow-500"
                                  : friend.status === "busy"
                                    ? "bg-red-500"
                                    : "bg-gray-500"
                            }`}
                          />
                        </div>
                        <div>
                          <p className="font-medium">{friend.displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {friend.status === "online"
                              ? t("ascend.status.online")
                              : friend.status === "away"
                                ? t("ascend.status.away")
                                : friend.status === "busy"
                                  ? t("ascend.status.busy")
                                  : t("ascend.status.offline")}
                            {friend.customMessage && (
                              <span className="ml-1 text-muted-foreground/70">
                                — {friend.customMessage}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartConversation(friend.uid)}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRemoveFriend(friend.uid)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-border/50 bg-card/50 p-6 text-center">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 font-medium">{t("ascend.friends.empty")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("ascend.friends.emptyHint")}
                  </p>
                  <Button
                    className="mt-4 text-secondary"
                    onClick={() => setActiveSection("search")}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    {t("ascend.friends.findFriends")}
                  </Button>
                </div>
              )}
            </div>
          );

        case "requests":
          return (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold">{t("ascend.requests.title")}</h1>

              {loadingRequests ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Incoming Requests */}
                  <div className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("ascend.requests.incoming")} ({incomingRequests.length})
                    </h2>
                    {incomingRequests.length > 0 ? (
                      <div className="space-y-2">
                        {incomingRequests.map(request => (
                          <div
                            key={request.id}
                            className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 p-4"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
                                <span className="text-primary-foreground text-sm font-bold">
                                  {request.fromDisplayName?.[0]?.toUpperCase() || "U"}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium">{request.fromDisplayName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {t("ascend.requests.wantsToAdd")}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                className="text-secondary"
                                size="sm"
                                onClick={() =>
                                  handleAcceptRequest(request.id, request.fromUid)
                                }
                              >
                                <Check className="mr-1 h-4 w-4" />
                                {t("ascend.requests.accept")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDenyRequest(request.id)}
                              >
                                <X className="mr-1 h-4 w-4" />
                                {t("ascend.requests.deny")}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
                        <p className="text-sm text-muted-foreground">
                          {t("ascend.requests.noIncoming")}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Outgoing Requests */}
                  <div className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("ascend.requests.outgoing")} ({outgoingRequests.length})
                    </h2>
                    {outgoingRequests.length > 0 ? (
                      <div className="space-y-2">
                        {outgoingRequests.map(request => (
                          <div
                            key={request.id}
                            className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 p-4"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
                                <span className="text-primary-foreground text-sm font-bold">
                                  {request.toDisplayName?.[0]?.toUpperCase() || "U"}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium">{request.toDisplayName}</p>
                                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {t("ascend.requests.pending")}
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDenyRequest(request.id)}
                            >
                              <X className="mr-1 h-4 w-4" />
                              {t("ascend.requests.cancel")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border/50 bg-card/50 p-4 text-center">
                        <p className="text-sm text-muted-foreground">
                          {t("ascend.requests.noOutgoing")}
                        </p>
                      </div>
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
                                  <p className="truncate text-sm font-semibold">
                                    {conversation.otherUser.displayName}
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
                            <p className="font-semibold">
                              {selectedConversation.otherUser.displayName}
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
                                        <p
                                          className={`mt-1 text-[10px] ${
                                            message.isOwn
                                              ? "text-secondary/60"
                                              : "text-muted-foreground/60"
                                          }`}
                                        >
                                          {message.createdAt?.toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </p>
                                      </div>
                                    </div>
                                  </React.Fragment>
                                );
                              })}
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
                              className="h-11 w-11 shrink-0 rounded-xl shadow-md"
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
            <div className="space-y-6">
              <h1 className="text-2xl font-bold">{t("ascend.notifications.title")}</h1>
              <div className="rounded-xl border border-border/50 bg-card/50 p-6 text-center">
                <Bell className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-sm text-muted-foreground">
                  {t("ascend.notifications.empty")}
                </p>
              </div>
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
                        {/* Discord */}
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
                          <Input
                            type="text"
                            placeholder={t("ascend.settings.discordPlaceholder")}
                            value={editDiscord}
                            onChange={e => setEditDiscord(e.target.value)}
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
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1b2838]/10">
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
                    {(userData?.socials?.discord ||
                      userData?.socials?.github ||
                      userData?.socials?.steam) && (
                      <div className="mt-5 border-t border-border/50 pt-5">
                        <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                          {t("ascend.settings.socialLinks")}
                        </h4>
                        <div className="flex flex-wrap gap-3">
                          {userData?.socials?.discord && (
                            <div className="flex items-center gap-2 rounded-xl bg-[#5865F2]/10 px-3 py-2 text-sm">
                              <svg
                                className="h-4 w-4 text-[#5865F2]"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                              </svg>
                              <span>{userData.socials.discord}</span>
                            </div>
                          )}
                          {userData?.socials?.github && (
                            <div className="flex items-center gap-2 rounded-xl bg-foreground/10 px-3 py-2 text-sm">
                              <Github className="h-4 w-4" />
                              <span>{userData.socials.github}</span>
                            </div>
                          )}
                          {userData?.socials?.steam && (
                            <div className="flex items-center gap-2 rounded-xl bg-[#1b2838]/10 px-3 py-2 text-sm">
                              <svg
                                className="h-4 w-4 text-[#1b2838] dark:text-white"
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
                      !userData?.socials?.discord &&
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

              {/* Subscription Management - Premium Card Design */}
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
                    <h2 className="font-semibold">{t("ascend.settings.subscription")}</h2>
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

                <div className="relative p-5">
                  {ascendAccess.isVerified ? (
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
                  ) : ascendAccess.isSubscribed ? (
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
                              {t("ascend.settings.ascendPro")}
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

                      <Button
                        variant="outline"
                        className="h-12 w-full gap-2 border-primary/30 bg-primary/5 hover:bg-primary/10"
                        onClick={handleManageSubscription}
                      >
                        <Settings className="h-4 w-4" />
                        {t("ascend.settings.manageSubscription")}
                      </Button>
                    </div>
                  ) : ascendAccess.hasAccess && ascendAccess.daysRemaining > 0 ? (
                    // Trial Active - Engaging Design
                    <div className="space-y-5">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/20 ring-2 ring-primary/20">
                            <Clock className="h-7 w-7 text-primary" />
                          </div>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold">
                            {t("ascend.settings.freeTrial")}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {t("ascend.settings.trialDaysRemaining", {
                              days: ascendAccess.daysRemaining,
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
                            {ascendAccess.daysRemaining} {t("ascend.settings.daysLeft")}
                          </span>
                        </div>
                        <div className="h-3 w-full overflow-hidden rounded-full bg-muted/50">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${((7 - ascendAccess.daysRemaining) / 7) * 100}%`,
                            }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500"
                          />
                        </div>
                      </div>

                      <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-violet-500/5 p-5">
                        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
                        <div className="relative">
                          <div className="mb-3 flex items-center gap-2">
                            <BadgeDollarSign className="h-5 w-5 text-primary" />
                            <h4 className="font-semibold">
                              {t("ascend.settings.upgradeToProTitle")}
                            </h4>
                          </div>
                          <p className="mb-4 text-sm text-muted-foreground">
                            {t("ascend.settings.upgradeToProDescription")}
                          </p>
                          <Button
                            className="h-12 w-full gap-2 bg-gradient-to-r from-primary to-violet-600 text-white shadow-lg shadow-primary/25 transition-shadow hover:shadow-primary/40"
                            onClick={handleSubscribe}
                          >
                            <BadgeDollarSign className="h-4 w-4" />
                            {t("ascend.settings.upgradeToPro")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // No Access / Trial Expired - Compelling CTA
                    <div className="space-y-5">
                      <div className="text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-violet-500/20">
                          <BadgeDollarSign className="h-8 w-8 text-primary" />
                        </div>
                        <h3 className="text-xl font-bold">
                          {t("ascend.settings.joinAscend")}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("ascend.settings.subscribeToUnlock")}
                        </p>
                      </div>

                      <div className="grid gap-2">
                        {[
                          { icon: Users, text: t("ascend.settings.feature1") },
                          { icon: CloudIcon, text: t("ascend.settings.feature2") },
                          { icon: Gamepad2, text: t("ascend.settings.feature3") },
                          { icon: Sparkle, text: t("ascend.settings.feature4") },
                        ].map((feature, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="flex items-center gap-3 rounded-lg bg-muted/30 p-3"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                              <feature.icon className="h-4 w-4 text-primary" />
                            </div>
                            <span className="text-sm">{feature.text}</span>
                          </motion.div>
                        ))}
                      </div>

                      <Button
                        className="h-12 w-full gap-2 bg-gradient-to-r from-primary to-violet-600 text-white shadow-lg shadow-primary/25 transition-shadow hover:shadow-primary/40"
                        onClick={handleSubscribe}
                      >
                        <BadgeDollarSign className="h-4 w-4" />
                        {t("ascend.settings.subscribe")}
                      </Button>
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

              {/* Sign out */}
              <button
                onClick={handleLogout}
                className="bg-destructive/10 text-destructive hover:bg-destructive/20 flex w-full items-center justify-between rounded-2xl p-5 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <LogOut className="h-5 w-5" />
                  <span className="font-medium">{t("account.signOut")}</span>
                </div>
                <ChevronRight className="h-5 w-5" />
              </button>
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

                          {/* Level Badge */}
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

                          {/* Bio */}
                          {viewingProfile.bio && (
                            <p className="mb-4 max-w-lg text-muted-foreground">
                              {viewingProfile.bio}
                            </p>
                          )}

                          {/* Country & Socials */}
                          <div className="flex flex-wrap items-center gap-3">
                            {viewingProfile.country && (
                              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <Globe className="h-4 w-4 text-blue-500" />
                                <span>{viewingProfile.country}</span>
                              </div>
                            )}
                            {viewingProfile.socials?.discord && (
                              <div className="flex items-center gap-1.5 rounded-lg bg-[#5865F2]/10 px-2.5 py-1 text-sm">
                                <svg
                                  className="h-4 w-4 text-[#5865F2]"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                                </svg>
                                <span>{viewingProfile.socials.discord}</span>
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
                        </div>

                        {/* Action Buttons */}
                        <div className="flex shrink-0 gap-2">
                          {viewingProfile.isFriend ? (
                            <Button
                              variant="outline"
                              onClick={() => handleStartConversation(viewingProfile.uid)}
                              className="gap-2"
                            >
                              <MessageCircle className="h-4 w-4" />
                              {t("ascend.profile.message") || "Message"}
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleSendRequest(viewingProfile.uid)}
                              className="gap-2 text-secondary"
                            >
                              <UserPlus className="h-4 w-4" />
                              {t("ascend.friends.addFriend")}
                            </Button>
                          )}

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

                  {/* Stats Grid */}
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
                        {viewingProfile.achievements?.reduce(
                          (acc, game) =>
                            acc +
                            (game.achievements?.filter(a => a.achieved)?.length || 0),
                          0
                        ) || 0}
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

                  {/* Top Games */}
                  {viewingProfile.games?.length > 0 && (
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

                  {/* Recent Achievements */}
                  {viewingProfile.achievements?.some(g =>
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

        default:
          return null;
      }
    };

    return (
      <div className="fixed inset-0 top-[60px] flex">
        {/* Sidebar */}
        <AscendSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          user={user}
          userData={userData}
          onStatusChange={setUserStatus}
          ascendAccess={ascendAccess}
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
    );
  }

  // Sign up / Login form - open two-column layout
  return (
    <div className="container mx-auto flex min-h-[80vh] max-w-5xl items-center px-6 py-8">
      <div className="grid w-full items-center gap-12 lg:grid-cols-2 lg:gap-20">
        {/* Left side - Branding & Info */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          <div className="space-y-2">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-sm font-medium uppercase tracking-wider text-muted-foreground"
            >
              {isLogin ? t("account.welcomeBack") : t("account.setUp")}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-4xl font-bold tracking-tight lg:text-5xl"
            >
              {isLogin ? t("account.loginSubtitle") : t("account.joinAscend")}
            </motion.h1>
          </div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-5"
          >
            {!isLogin && (
              <p className="text-sm text-muted-foreground">
                {t("account.featuresIntro")}
              </p>
            )}
            {isLogin && (
              <p className="text-sm text-muted-foreground">
                {t("account.welcomeBackIntro")}
              </p>
            )}
            {[
              {
                icon: Zap,
                label: t("account.features.autoUpdate"),
                desc: t("account.features.autoUpdateDesc"),
              },
              {
                icon: Users,
                label: t("account.features.friends"),
                desc: t("account.features.friendsDesc"),
              },
              {
                icon: BarChart3,
                label: t("account.features.profiles"),
                desc: t("account.features.profilesDesc"),
              },
              {
                icon: Cloud,
                label: t("account.features.cloudSync"),
                desc: t("account.features.cloudSyncDesc"),
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className="flex items-start gap-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{feature.label}</p>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </div>
              </motion.div>
            ))}

            {/* Pricing notice - only on signup */}
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="relative mt-4 overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5"
              >
                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">
                      {t("account.pricingFriendly")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("account.pricingDetails")}&nbsp;
                    <a
                      onClick={() =>
                        window.electron.openURL("https://ascendara.app/ascend")
                      }
                      className="cursor inline-flex cursor-pointer items-center text-xs text-primary hover:underline"
                    >
                      {t("common.learnMore")}
                      <ExternalLink className="ml-1 inline-block h-3 w-3" />
                    </a>
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>

        {/* Right side - Form */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="space-y-6"
        >
          {/* Account Already Exists Error */}
          {accountExistsError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-destructive/50 bg-destructive/10 rounded-xl border p-4"
            >
              <div className="flex items-start gap-3">
                <div className="bg-destructive/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                  <Shield className="text-destructive h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-destructive font-semibold">
                    {t("account.errors.accountExists")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {accountExistsError.email
                      ? t("account.errors.accountExistsWithEmail", {
                          email: accountExistsError.email,
                        })
                      : t("account.errors.accountExistsNoEmail")}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAccountExistsError(null);
                        setIsLogin(true);
                      }}
                    >
                      {t("account.errors.signInInstead")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
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

          {/* Google Sign In */}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full gap-3"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading || isSubmitting}
          >
            {isGoogleLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <GoogleIcon className="h-5 w-5" />
            )}
            {t("account.form.continueWithGoogle")}
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-3 text-muted-foreground">
                {t("account.form.orContinueWith")}
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="displayName"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="displayName">{t("account.form.displayName")}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="displayName"
                        name="displayName"
                        type="text"
                        placeholder={t("account.form.displayNamePlaceholder")}
                        value={formData.displayName}
                        onChange={handleInputChange}
                        className="h-11 pl-10"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <Label htmlFor="email">{t("account.form.email")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t("account.form.emailPlaceholder")}
                  value={formData.email}
                  onChange={handleInputChange}
                  className="h-11 pl-10"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("account.form.password")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("account.form.passwordPlaceholder")}
                  value={formData.password}
                  onChange={handleInputChange}
                  className="h-11 pl-10 pr-10"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="confirmPassword"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">
                      {t("account.form.confirmPassword")}
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder={t("account.form.confirmPasswordPlaceholder")}
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        className="h-11 pl-10 pr-10"
                        disabled={isSubmitting}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Terms checkbox - only on signup */}
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="terms"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-start gap-3 py-2">
                    <Checkbox
                      id="terms"
                      checked={agreedToTerms}
                      onCheckedChange={setAgreedToTerms}
                      disabled={isSubmitting}
                      className="mt-0.5 cursor-pointer"
                    />
                    <label
                      htmlFor="terms"
                      className="cursor-pointer text-sm text-muted-foreground"
                    >
                      {t("account.form.termsPrefix")}{" "}
                      <button
                        type="button"
                        onClick={() =>
                          window.electron?.openURL("https://ascendara.app/ascend/terms")
                        }
                        className="text-primary hover:underline"
                      >
                        {t("account.form.termsLink")}
                      </button>{" "}
                      {t("account.form.termsAnd")}{" "}
                      <button
                        type="button"
                        onClick={() =>
                          window.electron?.openURL("https://ascendara.app/ascend/privacy")
                        }
                        className="text-primary hover:underline"
                      >
                        {t("account.form.privacyLink")}
                      </button>
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              className="h-11 w-full text-secondary"
              disabled={isSubmitting || isGoogleLoading || (!isLogin && !agreedToTerms)}
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              {isLogin ? t("account.form.signIn") : t("account.form.createAccount")}
            </Button>
          </form>

          {/* Toggle mode */}
          <p className="text-center text-sm text-muted-foreground">
            <button type="button" onClick={toggleMode} className="hover:text-primary">
              {isLogin ? t("account.noAccount") : t("account.haveAccount")}
            </button>
          </p>

          {/* Forgot password - only on login */}
          {isLogin && (
            <p className="text-center text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => window.electron?.openURL("https://ascendara.app/discord")}
                className="hover:text-primary"
              >
                {t("account.forgotPassword")}
              </button>
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Ascend;
