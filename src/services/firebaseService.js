// Firebase SDK initialization for Ascendara account management
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  sendEmailVerification,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  arrayRemove,
  addDoc,
  orderBy,
  limit,
  writeBatch,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (only in browser environment where supported)
let analytics = null;
isSupported().then(supported => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

// Initialize Auth
const auth = getAuth(app);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});

/**
 * Sign in with Google
 * Uses popup with fallback to redirect for Electron compatibility
 * @returns {Promise<{user: object, error: string|null, isNewUser: boolean}>}
 */
export const signInWithGoogle = async () => {
  try {
    console.log("[signInWithGoogle] Starting Google sign-in...");
    let result;

    try {
      // Try popup first
      result = await signInWithPopup(auth, googleProvider);
      console.log("[signInWithGoogle] Popup sign-in successful");
    } catch (popupError) {
      // User cancelled the popup - just return silently
      if (
        popupError.code === "auth/popup-closed-by-user" ||
        popupError.code === "auth/cancelled-popup-request"
      ) {
        console.log("User cancelled Google sign-in");
        return { user: null, error: null, isNewUser: false, cancelled: true };
      }
      // If popup is blocked (common in Electron), fall back to redirect
      if (popupError.code === "auth/popup-blocked") {
        console.log("Popup blocked, using redirect...");
        await signInWithRedirect(auth, googleProvider);
        // The page will redirect, so we won't reach here
        // Result will be handled by checkGoogleRedirectResult on next load
        return { user: null, error: null, isNewUser: false, redirecting: true };
      }
      throw popupError;
    }

    const user = result.user;
    const isNewUser = result._tokenResponse?.isNewUser ?? false;
    console.log(
      "[signInWithGoogle] User authenticated:",
      user.uid,
      "isNewUser:",
      isNewUser
    );

    // Check if user document exists, create if new
    const userDoc = await getDoc(doc(db, "users", user.uid));
    console.log("[signInWithGoogle] User document exists:", userDoc.exists());
    if (!userDoc.exists()) {
      console.log("[signInWithGoogle] Creating new user document...");
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        provider: "google",
        bio: null,
        country: null,
        socials: {
          discord: null,
          github: null,
          steam: null,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log("[signInWithGoogle] User document created successfully");

      // Set initial online status
      await setDoc(doc(db, "userStatus", user.uid), {
        status: "online",
        customMessage: "",
        updatedAt: serverTimestamp(),
      });
      console.log("[signInWithGoogle] User status document created");
    }

    console.log("[signInWithGoogle] Sign-in complete, returning user");
    return { user, error: null, isNewUser };
  } catch (error) {
    console.error("Google sign-in error:", error);
    return { user: null, error: getErrorMessage(error.code), isNewUser: false };
  }
};

/**
 * Check for Google redirect result (call on app init)
 * @returns {Promise<{user: object|null, error: string|null, isNewUser: boolean}>}
 */
export const checkGoogleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      const user = result.user;
      const isNewUser = result._tokenResponse?.isNewUser ?? false;

      // Check if user document exists, create if new
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          provider: "google",
          bio: null,
          country: null,
          socials: {
            discord: null,
            github: null,
            steam: null,
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        // Set initial online status
        await setDoc(doc(db, "userStatus", user.uid), {
          status: "online",
          customMessage: "",
          updatedAt: serverTimestamp(),
        });
      }

      return { user, error: null, isNewUser };
    }
    return { user: null, error: null, isNewUser: false };
  } catch (error) {
    console.error("Google redirect result error:", error);
    return { user: null, error: getErrorMessage(error.code), isNewUser: false };
  }
};

/**
 * Register a new user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} displayName - User display name
 * @param {string} hardwareId - Optional hardware ID to register
 * @returns {Promise<{user: object, error: string|null}>}
 */
export const registerUser = async (email, password, displayName, hardwareId = null) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update display name
    await updateProfile(user, { displayName });

    // Send email verification
    await sendEmailVerification(user);

    // Create user document in Firestore
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: user.email,
      displayName,
      photoURL: null,
      bio: null,
      country: null,
      socials: {
        discord: null,
        github: null,
        steam: null,
      },
      hardwareId: hardwareId || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Set initial online status
    await setDoc(doc(db, "userStatus", user.uid), {
      status: "online",
      customMessage: "",
      updatedAt: serverTimestamp(),
    });

    // Register hardware ID if provided (non-blocking - don't fail registration if this fails)
    if (hardwareId) {
      try {
        const createdAt = new Date();
        const trialEndDate = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

        await setDoc(doc(db, "hardwareIds", hardwareId), {
          hardwareId,
          userId: user.uid,
          createdAt: serverTimestamp(),
          trialEndDate: Timestamp.fromDate(trialEndDate),
        });
      } catch (hwError) {
        console.warn("Hardware ID registration failed:", hwError);
        // Don't fail the registration - hardware ID will be registered on next access check
      }
    }

    return { user, error: null };
  } catch (error) {
    console.error("Registration error:", error);
    return { user: null, error: getErrorMessage(error.code) };
  }
};

/**
 * Sign in user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{user: object, error: string|null}>}
 */
export const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error) {
    console.error("Login error:", error);
    return { user: null, error: getErrorMessage(error.code) };
  }
};

/**
 * Sign out the current user
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const logoutUser = async () => {
  try {
    await signOut(auth);
    return { success: true, error: null };
  } catch (error) {
    console.error("Logout error:", error);
    return { success: false, error: getErrorMessage(error.code) };
  }
};

/**
 * Send password reset email
 * @param {string} email - User email
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const resetPassword = async email => {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true, error: null };
  } catch (error) {
    console.error("Password reset error:", error);
    return { success: false, error: getErrorMessage(error.code) };
  }
};

/**
 * Update user profile
 * @param {object} profileData - Profile data to update (displayName, photoURL)
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const updateUserProfile = async profileData => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "No user logged in" };
    }

    await updateProfile(user, profileData);

    // Update Firestore document
    await updateDoc(doc(db, "users", user.uid), {
      ...profileData,
      updatedAt: serverTimestamp(),
    });

    return { success: true, error: null };
  } catch (error) {
    console.error("Profile update error:", error);
    return { success: false, error: getErrorMessage(error.code) };
  }
};

/**
 * Update extended profile data (bio, country, socials)
 * @param {object} profileData - Extended profile data
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const updateExtendedProfile = async profileData => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "No user logged in" };
    }

    // Validate bio length
    if (profileData.bio && profileData.bio.length > 100) {
      return { success: false, error: "Bio must be 100 characters or less" };
    }

    // Update Firestore document with extended profile data
    await updateDoc(doc(db, "users", user.uid), {
      bio: profileData.bio || null,
      country: profileData.country || null,
      socials: {
        linkedDiscord: profileData.socials?.linkedDiscord || null,
        epicId: profileData.socials?.epicId || null,
        github: profileData.socials?.github || null,
        steam: profileData.socials?.steam || null,
      },
      updatedAt: serverTimestamp(),
    });

    return { success: true, error: null };
  } catch (error) {
    console.error("Extended profile update error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Change user password
 * @param {string} currentPassword - Current password for reauthentication
 * @param {string} newPassword - New password
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const changePassword = async (currentPassword, newPassword) => {
  try {
    const user = auth.currentUser;
    if (!user || !user.email) {
      return { success: false, error: "No user logged in" };
    }

    // Reauthenticate user
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Update password
    await updatePassword(user, newPassword);

    return { success: true, error: null };
  } catch (error) {
    console.error("Password change error:", error);
    return { success: false, error: getErrorMessage(error.code) };
  }
};

/**
 * Request account deletion (sends request to API for manual processing)
 * @param {string} password - Current password for reauthentication
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const deleteAccount = async password => {
  try {
    const user = auth.currentUser;
    if (!user || !user.email) {
      return { success: false, error: "No user logged in" };
    }

    // Reauthenticate user to verify password
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);

    // Get user data for the request
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};

    // Send deletion request to API
    const response = await fetch("https://api.ascendara.app/account/request-deletion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: user.uid,
        email: user.email,
        displayName: userData.displayName || user.displayName || "Unknown",
      }),
    });

    const result = await response.json();

    if (result.success) {
      return { success: true, error: null };
    } else {
      return {
        success: false,
        error: result.error || "Failed to submit deletion request",
      };
    }
  } catch (error) {
    console.error("Account deletion request error:", error);
    return {
      success: false,
      error: getErrorMessage(error.code) || "Failed to submit request",
    };
  }
};

/**
 * Delete a freshly created account (no reauthentication needed)
 * Used when hardware ID check fails after Google sign-in
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const deleteNewAccount = async () => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "No user logged in" };
    }

    const uid = user.uid;

    // Delete Firestore documents
    try {
      await deleteDoc(doc(db, "users", uid));
    } catch (e) {
      console.warn("Failed to delete user doc:", e);
    }

    try {
      await deleteDoc(doc(db, "userStatus", uid));
    } catch (e) {
      console.warn("Failed to delete userStatus doc:", e);
    }

    // Delete user account from Firebase Auth
    await deleteUser(user);

    return { success: true, error: null };
  } catch (error) {
    console.error("New account deletion error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Get user data from Firestore
 * @param {string} uid - User ID
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
export const getUserData = async uid => {
  try {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      // Ensure all expected fields exist with defaults
      const data = docSnap.data();
      return {
        data: {
          ...data,
          bio: data.bio || null,
          country: data.country || null,
          socials: {
            linkedDiscord: data.socials?.linkedDiscord || null,
            epicId: data.socials?.epicId || null,
            github: data.socials?.github || null,
            steam: data.socials?.steam || null,
          },
        },
        error: null,
      };
    } else {
      // Return null data - document creation should happen during sign-in/registration
      return { data: null, error: "User data not found" };
    }
  } catch (error) {
    console.error("Get user data error:", error);
    return { data: null, error: getErrorMessage(error.code) };
  }
};

/**
 * Update user data in Firestore
 * @param {string} uid - User ID
 * @param {object} data - Data to update
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const updateUserData = async (uid, data) => {
  try {
    await updateDoc(doc(db, "users", uid), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return { success: true, error: null };
  } catch (error) {
    console.error("Update user data error:", error);
    return { success: false, error: getErrorMessage(error.code) };
  }
};

/**
 * Subscribe to auth state changes
 * @param {function} callback - Callback function receiving user object or null
 * @returns {function} Unsubscribe function
 */
export const subscribeToAuthChanges = callback => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Get current user
 * @returns {object|null} Current user or null
 */
export const getCurrentUser = () => {
  return auth.currentUser;
};

/**
 * Resend email verification
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const resendVerificationEmail = async () => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "No user logged in" };
    }

    await sendEmailVerification(user);
    return { success: true, error: null };
  } catch (error) {
    console.error("Resend verification error:", error);
    return { success: false, error: getErrorMessage(error.code) };
  }
};

/**
 * Reload current user to get updated emailVerified status
 * @returns {Promise<{success: boolean, user: object|null, error: string|null}>}
 */
export const reloadCurrentUser = async () => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, user: null, error: "No user logged in" };
    }

    await user.reload();
    return { success: true, user: auth.currentUser, error: null };
  } catch (error) {
    console.error("Reload user error:", error);
    return { success: false, user: null, error: getErrorMessage(error.code) };
  }
};

/**
 * Update user status (online, away, busy, invisible)
 * @param {string} status - Status type
 * @param {string} customMessage - Optional custom status message
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const updateUserStatus = async (status, customMessage = "") => {
  // Debug: trace what's setting status to invisible
  if (status === "invisible") {
    console.log("[updateUserStatus] Setting to invisible, stack:", new Error().stack);
  }

  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "No user logged in" };
    }

    const updateData = {
      status,
      customMessage,
      updatedAt: serverTimestamp(),
    };

    // Store preferred status if user manually sets a non-invisible status
    if (status !== "invisible") {
      updateData.preferredStatus = status;
    }

    await setDoc(doc(db, "userStatus", user.uid), updateData, { merge: true });

    return { success: true, error: null };
  } catch (error) {
    console.error("Update status error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Get user status
 * @param {string} userId - User ID to get status for
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
export const getUserStatus = async userId => {
  try {
    const statusDoc = await getDoc(doc(db, "userStatus", userId));
    if (statusDoc.exists()) {
      return { data: statusDoc.data(), error: null };
    }
    return { data: { status: "offline", customMessage: "" }, error: null };
  } catch (error) {
    console.error("Get status error:", error);
    return { data: null, error: error.message };
  }
};

/**
 * Sync local profile stats to Ascend
 * @param {object} profileData - Profile data to sync
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const syncProfileToAscend = async profileData => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    await updateDoc(doc(db, "users", user.uid), {
      profileStats: {
        level: profileData.level || 1,
        xp: profileData.xp || 0,
        totalPlaytime: profileData.totalPlaytime || 0,
        gamesPlayed: profileData.gamesPlayed || 0,
        totalGames: profileData.totalGames || 0,
        joinDate: profileData.joinDate || null,
        lastSynced: new Date().toISOString(),
      },
      updatedAt: serverTimestamp(),
    });

    return { success: true, error: null };
  } catch (error) {
    console.error("Sync profile error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Get synced profile stats from Ascend
 * @param {string} userId - User ID (optional, defaults to current user)
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
export const getProfileStats = async (userId = null) => {
  try {
    const targetUserId = userId || auth.currentUser?.uid;
    if (!targetUserId) {
      return { data: null, error: "Not authenticated" };
    }

    const userDoc = await getDoc(doc(db, "users", targetUserId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return { data: data.profileStats || null, error: null };
    }
    return { data: null, error: null };
  } catch (error) {
    console.error("Get status error:", error);
    return { data: null, error: error.message };
  }
};

// ==================== CLOUD LIBRARY ====================

/**
 * Sync local game library to cloud
 * @param {Array} games - Array of game objects to sync
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const syncCloudLibrary = async games => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Transform games to a storable format
    const localGamesData = games.map(game => ({
      name: game.game || game.name,
      // Store gameID for non-custom games (used for fetching game images/info)
      gameID: !game.isCustom && !game.custom && game.gameID ? game.gameID : null,
      version: game.version || null,
      online: game.online || false,
      dlc: game.dlc || false,
      isVr: game.isVr || false,
      isCustom: game.isCustom || game.custom || false,
      playTime: game.playTime || 0,
      launchCount: game.launchCount || 0,
      lastPlayed: game.lastPlayed || null,
      completed: game.completed || false,
      favorite: game.favorite || false,
      // Store achievement summary for quick display
      achievementStats: game.achievementStats
        ? {
            total: game.achievementStats.total || 0,
            unlocked: game.achievementStats.unlocked || 0,
            percentage: game.achievementStats.percentage || 0,
          }
        : null,
    }));

    // Get existing cloud library to merge (don't delete games that were removed locally)
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const existingCloudLibrary = userDoc.exists() ? userDoc.data().cloudLibrary : null;
    const existingGames = existingCloudLibrary?.games || [];

    // Merge: keep existing cloud games, update/add local games
    const mergedGamesMap = new Map();

    // First, add all existing cloud games
    existingGames.forEach(game => {
      mergedGamesMap.set(game.name, game);
    });

    // Then, update/add local games (local data takes priority for games that exist locally)
    localGamesData.forEach(game => {
      const existing = mergedGamesMap.get(game.name);
      if (existing) {
        // Merge: keep higher playtime, launch count, and update other fields
        mergedGamesMap.set(game.name, {
          ...game,
          playTime: Math.max(game.playTime || 0, existing.playTime || 0),
          launchCount: Math.max(game.launchCount || 0, existing.launchCount || 0),
          // Keep achievement stats if local has them, otherwise keep cloud
          achievementStats: game.achievementStats || existing.achievementStats,
          // Keep gameID if local has it, otherwise keep cloud's gameID
          gameID: game.gameID || existing.gameID || null,
        });
      } else {
        mergedGamesMap.set(game.name, game);
      }
    });

    const mergedGames = Array.from(mergedGamesMap.values());

    // Calculate achievement totals
    const gamesWithAchievements = mergedGames.filter(g => g.achievementStats);
    const totalAchievements = gamesWithAchievements.reduce(
      (acc, g) => acc + (g.achievementStats?.total || 0),
      0
    );
    const unlockedAchievements = gamesWithAchievements.reduce(
      (acc, g) => acc + (g.achievementStats?.unlocked || 0),
      0
    );

    await updateDoc(doc(db, "users", user.uid), {
      cloudLibrary: {
        games: mergedGames,
        totalGames: mergedGames.length,
        totalPlaytime: mergedGames.reduce((acc, g) => acc + (g.playTime || 0), 0),
        totalAchievements: totalAchievements,
        unlockedAchievements: unlockedAchievements,
        gamesWithAchievements: gamesWithAchievements.length,
        lastSynced: new Date().toISOString(),
      },
      updatedAt: serverTimestamp(),
    });

    return { success: true, error: null };
  } catch (error) {
    console.error("Sync cloud library error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Sync individual game achievements to cloud (full achievement data)
 * @param {string} gameName - Name of the game
 * @param {boolean} isCustom - Whether it's a custom game
 * @param {object} achievementData - Full achievement data object
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const syncGameAchievements = async (gameName, isCustom, achievementData) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    if (!achievementData?.achievements) {
      return { success: false, error: "No achievement data provided" };
    }

    // Store achievements in a subcollection for the game
    const gameAchievementsRef = doc(db, "users", user.uid, "gameAchievements", gameName);

    await setDoc(gameAchievementsRef, {
      gameName: gameName,
      isCustom: isCustom || false,
      achievements: achievementData.achievements.map(ach => ({
        achID: ach.achID || null,
        name: ach.message || ach.name || "Unknown",
        description: ach.description || "",
        icon: ach.icon || null,
        achieved: ach.achieved || false,
        unlockTime: ach.unlockTime || null,
      })),
      totalAchievements: achievementData.achievements.length,
      unlockedAchievements: achievementData.achievements.filter(a => a.achieved).length,
      lastSynced: new Date().toISOString(),
    });

    return { success: true, error: null };
  } catch (error) {
    console.error("Sync game achievements error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Get game achievements from cloud
 * @param {string} gameName - Name of the game
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
export const getGameAchievements = async gameName => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { data: null, error: "Not authenticated" };
    }

    const gameAchievementsRef = doc(db, "users", user.uid, "gameAchievements", gameName);
    const docSnap = await getDoc(gameAchievementsRef);

    if (docSnap.exists()) {
      return { data: docSnap.data(), error: null };
    }
    return { data: null, error: null };
  } catch (error) {
    console.error("Get game achievements error:", error);
    return { data: null, error: error.message };
  }
};

/**
 * Get all synced game achievements from cloud
 * @returns {Promise<{data: Array|null, error: string|null}>}
 */
export const getAllGameAchievements = async () => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { data: null, error: "Not authenticated" };
    }

    const achievementsRef = collection(db, "users", user.uid, "gameAchievements");
    const querySnapshot = await getDocs(achievementsRef);

    const achievements = [];
    querySnapshot.forEach(doc => {
      achievements.push({ id: doc.id, ...doc.data() });
    });

    return { data: achievements, error: null };
  } catch (error) {
    console.error("Get all game achievements error:", error);
    return { data: null, error: error.message };
  }
};

/**
 * Get cloud library data
 * @param {string} userId - User ID (optional, defaults to current user)
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
export const getCloudLibrary = async (userId = null) => {
  try {
    const targetUserId = userId || auth.currentUser?.uid;
    if (!targetUserId) {
      return { data: null, error: "Not authenticated" };
    }

    const userDoc = await getDoc(doc(db, "users", targetUserId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return { data: data.cloudLibrary || null, error: null };
    }
    return { data: null, error: null };
  } catch (error) {
    console.error("Get cloud library error:", error);
    return { data: null, error: error.message };
  }
};

/**
 * Delete a game from cloud library (manual deletion only)
 * @param {string} gameName - Name of the game to delete
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const deleteCloudGame = async gameName => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Get current cloud library
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      return { success: false, error: "User data not found" };
    }

    const cloudLibrary = userDoc.data().cloudLibrary;
    if (!cloudLibrary?.games) {
      return { success: false, error: "No cloud library found" };
    }

    // Filter out the game to delete
    const updatedGames = cloudLibrary.games.filter(g => g.name !== gameName);

    if (updatedGames.length === cloudLibrary.games.length) {
      return { success: false, error: "Game not found in cloud library" };
    }

    // Recalculate totals
    const gamesWithAchievements = updatedGames.filter(g => g.achievementStats);
    const totalAchievements = gamesWithAchievements.reduce(
      (acc, g) => acc + (g.achievementStats?.total || 0),
      0
    );
    const unlockedAchievements = gamesWithAchievements.reduce(
      (acc, g) => acc + (g.achievementStats?.unlocked || 0),
      0
    );

    // Update cloud library
    await updateDoc(doc(db, "users", user.uid), {
      cloudLibrary: {
        games: updatedGames,
        totalGames: updatedGames.length,
        totalPlaytime: updatedGames.reduce((acc, g) => acc + (g.playTime || 0), 0),
        totalAchievements: totalAchievements,
        unlockedAchievements: unlockedAchievements,
        gamesWithAchievements: gamesWithAchievements.length,
        lastSynced: cloudLibrary.lastSynced, // Keep original sync time
      },
      updatedAt: serverTimestamp(),
    });

    // Also delete the game's achievements from subcollection
    try {
      await deleteDoc(doc(db, "users", user.uid, "gameAchievements", gameName));
    } catch (e) {
      // Ignore if achievements doc doesn't exist
      console.warn("Could not delete game achievements (may not exist):", e);
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("Delete cloud game error:", error);
    return { success: false, error: error.message };
  }
};

// ==================== ASCEND SUBSCRIPTION ====================

/**
 * Check if hardware ID already has an account (for preventing multiple accounts)
 * @param {string} hardwareId - The hardware ID to check
 * @returns {Promise<{hasAccount: boolean, email: string|null, error: string|null}>}
 */
export const checkHardwareIdAccount = async hardwareId => {
  try {
    if (!hardwareId) {
      return { hasAccount: false, email: null, error: null };
    }

    const hwDoc = await getDoc(doc(db, "hardwareIds", hardwareId));
    if (!hwDoc.exists()) {
      return { hasAccount: false, email: null, error: null };
    }

    const data = hwDoc.data();
    // Get the linked user's email (partially masked for privacy)
    // Only try to fetch user doc if we're authenticated (users collection requires auth)
    if (data.userId && auth.currentUser) {
      try {
        const userDoc = await getDoc(doc(db, "users", data.userId));
        if (userDoc.exists()) {
          const email = userDoc.data().email || "";
          // Mask email for privacy: show first 2 chars and domain
          const maskedEmail =
            email.length > 0
              ? email.substring(0, 2) + "***@" + email.split("@")[1]
              : null;
          return { hasAccount: true, email: maskedEmail, error: null };
        }
      } catch (userError) {
        // Can't read user doc - just return that account exists without email
        console.warn("Could not fetch user email:", userError);
      }
    }

    return { hasAccount: true, email: null, error: null };
  } catch (error) {
    console.error("Check hardware ID account error:", error);
    return { hasAccount: false, email: null, error: error.message };
  }
};

/**
 * Check if hardware ID belongs to a deleted account
 * @param {string} hardwareId - The hardware ID to check
 * @returns {Promise<{isDeleted: boolean, email: string|null, error: string|null}>}
 */
export const checkDeletedAccount = async hardwareId => {
  try {
    if (!hardwareId) {
      return { isDeleted: false, email: null, error: null };
    }

    const hwDoc = await getDoc(doc(db, "hardwareIds", hardwareId));
    if (!hwDoc.exists()) {
      return { isDeleted: false, email: null, error: null };
    }

    const data = hwDoc.data();
    const isDeleted = data.deletedAcc === true;

    // Get the linked user's email if account is deleted
    let email = null;
    if (isDeleted && data.userId && auth.currentUser) {
      try {
        const userDoc = await getDoc(doc(db, "users", data.userId));
        if (userDoc.exists()) {
          const userEmail = userDoc.data().email || "";
          // Mask email for privacy: show first 2 chars and domain
          email =
            userEmail.length > 0
              ? userEmail.substring(0, 2) + "***@" + userEmail.split("@")[1]
              : null;
        }
      } catch (userError) {
        console.warn("Could not fetch user email:", userError);
      }
    }

    return { isDeleted, email, error: null };
  } catch (error) {
    console.error("Check deleted account error:", error);
    return { isDeleted: false, email: null, error: error.message };
  }
};

/**
 * Check if hardware ID has been used for a trial before
 * @param {string} hardwareId - The hardware ID to check
 * @returns {Promise<{used: boolean, trialExpired: boolean, linkedUserId: string|null}>}
 */
export const checkHardwareIdTrial = async hardwareId => {
  try {
    if (!hardwareId) {
      return { used: false, trialExpired: false, linkedUserId: null };
    }

    const hwDoc = await getDoc(doc(db, "hardwareIds", hardwareId));
    if (!hwDoc.exists()) {
      return { used: false, trialExpired: false, linkedUserId: null };
    }

    const data = hwDoc.data();
    const trialEndDate = data.trialEndDate?.toDate();
    const trialExpired = trialEndDate ? trialEndDate < new Date() : false;

    return {
      used: true,
      trialExpired,
      linkedUserId: data.userId,
    };
  } catch (error) {
    console.error("Check hardware ID error:", error);
    return { used: false, trialExpired: false, linkedUserId: null };
  }
};

/**
 * Register hardware ID for trial tracking
 * @param {string} hardwareId - The hardware ID to register
 * @param {string} userId - The user ID to link
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const registerHardwareId = async (hardwareId, userId) => {
  try {
    if (!hardwareId || !userId) {
      return { success: false, error: "Missing hardware ID or user ID" };
    }

    const user = auth.currentUser;
    if (!user || user.uid !== userId) {
      return { success: false, error: "Not authenticated" };
    }

    // Check if hardware ID already exists (skip if already registered)
    const hwDoc = await getDoc(doc(db, "hardwareIds", hardwareId));
    if (hwDoc.exists()) {
      // Already registered, just update user doc
      await updateDoc(doc(db, "users", userId), {
        hardwareId,
        updatedAt: serverTimestamp(),
      });
      return { success: true, error: null };
    }

    // Get user's creation date for trial end calculation
    const userDoc = await getDoc(doc(db, "users", userId));
    const userData = userDoc.exists() ? userDoc.data() : null;
    const createdAt =
      userData?.createdAt?.toDate() || new Date(user.metadata.creationTime);
    const trialEndDate = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Store hardware ID with trial info
    await setDoc(doc(db, "hardwareIds", hardwareId), {
      hardwareId,
      userId,
      createdAt: serverTimestamp(),
      trialEndDate: Timestamp.fromDate(trialEndDate),
    });

    // Also store hardware ID in user document
    await updateDoc(doc(db, "users", userId), {
      hardwareId,
      updatedAt: serverTimestamp(),
    });

    return { success: true, error: null };
  } catch (error) {
    console.error("Register hardware ID error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Update user's Ascend subscription status in Firestore
 * @param {object} subscriptionData - Subscription data from Stripe
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const updateAscendSubscription = async subscriptionData => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const userRef = doc(db, "users", user.uid);

    await updateDoc(userRef, {
      ascendSubscription: {
        active: true,
        subscriptionId: subscriptionData.subscriptionId,
        customerId: subscriptionData.customerId,
        expiresAt: Timestamp.fromMillis(subscriptionData.currentPeriodEnd * 1000),
        cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd || false,
        updatedAt: serverTimestamp(),
      },
    });

    return { success: true, error: null };
  } catch (error) {
    console.error("Update Ascend subscription error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Verify user's Ascend access (subscription only - trial removed)
 * This checks server-side data that can't be manipulated client-side
 * @param {string} hardwareId - Optional hardware ID (kept for compatibility)
 * @returns {Promise<{hasAccess: boolean, daysRemaining: number, isSubscribed: boolean, isVerified: boolean, trialBlocked: boolean, noTrial: boolean, noTrialReason: string|null, error: string|null}>}
 */
export const verifyAscendAccess = async (hardwareId = null) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return {
        hasAccess: false,
        daysRemaining: 0,
        isSubscribed: false,
        isVerified: false,
        trialBlocked: false,
        noTrial: false,
        noTrialReason: null,
        error: "Not authenticated",
      };
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      const authCreationTime = new Date(user.metadata.creationTime);
      const now = new Date();
      const trialEndDate = new Date(authCreationTime.getTime() + 7 * 24 * 60 * 60 * 1000);
      const daysRemaining = Math.ceil((trialEndDate - now) / (24 * 60 * 60 * 1000));

      return {
        hasAccess: daysRemaining > 0,
        daysRemaining: Math.max(0, daysRemaining),
        isSubscribed: false,
        isVerified: false,
        trialBlocked: false,
        noTrial: false,
        noTrialReason: null,
        error: null,
      };
    }

    const userData = userDoc.data();

    // Check if user is verified (owner, contributor, or verified badge)
    // Verified users get full access without subscription
    if (userData.verified || userData.owner || userData.contributor) {
      return {
        hasAccess: true,
        daysRemaining: -1,
        isSubscribed: false,
        isVerified: true,
        trialBlocked: false,
        noTrial: false,
        noTrialReason: null,
        error: null,
      };
    }

    // Check if user has active subscription (bypasses hardware check and noTrial)
    if (userData.ascendSubscription?.active) {
      const expiresAt = userData.ascendSubscription.expiresAt?.toDate();
      if (expiresAt && expiresAt > new Date()) {
        return {
          hasAccess: true,
          daysRemaining: -1,
          isSubscribed: true,
          isVerified: false,
          trialBlocked: false,
          noTrial: false,
          noTrialReason: null,
          error: null,
        };
      }
    }

    // Check if user is blocked from free trial
    if (userData.noTrial === true) {
      return {
        hasAccess: false,
        daysRemaining: 0,
        isSubscribed: false,
        isVerified: false,
        trialBlocked: false,
        noTrial: true,
        noTrialReason: userData.noTrialReason || null,
        error: null,
      };
    }

    // Check hardware ID for trial abuse (non-blocking - don't fail access check if this fails)
    if (hardwareId) {
      try {
        // If user doesn't have a hardware ID stored, register it
        if (!userData.hardwareId) {
          // Check if this hardware ID was used by another account with expired trial
          const hwCheck = await checkHardwareIdTrial(hardwareId);
          if (hwCheck.used && hwCheck.trialExpired && hwCheck.linkedUserId !== user.uid) {
            // This hardware already used a trial on another account
            return {
              hasAccess: false,
              daysRemaining: 0,
              isSubscribed: false,
              isVerified: false,
              trialBlocked: true,
              noTrial: false,
              noTrialReason: null,
              error: "Trial already used on this device",
            };
          }
          // Register the hardware ID for this user (don't await - fire and forget)
          registerHardwareId(hardwareId, user.uid).catch(e =>
            console.warn("Hardware ID registration failed:", e)
          );
        } else if (userData.hardwareId !== hardwareId) {
          // User has a different hardware ID stored - could be using multiple devices
          // Check if the new hardware ID has an expired trial
          const hwCheck = await checkHardwareIdTrial(hardwareId);
          if (hwCheck.used && hwCheck.trialExpired && hwCheck.linkedUserId !== user.uid) {
            return {
              hasAccess: false,
              daysRemaining: 0,
              isSubscribed: false,
              isVerified: false,
              trialBlocked: true,
              noTrial: false,
              noTrialReason: null,
              error: "Trial already used on this device",
            };
          }
        }
      } catch (hwError) {
        // Hardware ID check failed - log but don't block access
        console.warn("Hardware ID check failed:", hwError);
      }
    }

    // Check trial period (7 days from account creation)
    // Use Firebase Auth creation time as the source of truth (can't be manipulated client-side)
    const authCreationTime = new Date(user.metadata.creationTime);
    const storedCreationTime = userData.createdAt?.toDate?.() || null;
    const now = new Date();

    // For new accounts, storedCreationTime might be null (serverTimestamp not yet resolved)
    // In that case, trust the auth creation time
    let createdAt = authCreationTime;

    if (storedCreationTime) {
      const timeDiff = Math.abs(authCreationTime - storedCreationTime);
      // If times differ by more than 5 minutes, use the earlier (more restrictive) date
      // Allow 5 min tolerance for serverTimestamp resolution delays
      if (timeDiff > 300000) {
        console.warn("[AscendAccess] Creation time mismatch detected");
        createdAt =
          authCreationTime < storedCreationTime ? authCreationTime : storedCreationTime;
      }
    }

    const trialEndDate = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.ceil((trialEndDate - now) / (24 * 60 * 60 * 1000));

    return {
      hasAccess: daysRemaining > 0,
      daysRemaining: Math.max(0, daysRemaining),
      isSubscribed: false,
      isVerified: false,
      trialBlocked: false,
      noTrial: false,
      noTrialReason: null,
      error: null,
    };
  } catch (error) {
    console.error("Verify Ascend access error:", error);
    return {
      hasAccess: false,
      daysRemaining: 0,
      isSubscribed: false,
      isVerified: false,
      trialBlocked: false,
      noTrial: false,
      noTrialReason: null,
      error: error.message,
    };
  }
};

// ==================== FRIEND SYSTEM ====================

/**
 * Search users by display name with extended profile data
 * @param {string} searchQuery - Search query
 * @returns {Promise<{users: array, error: string|null}>}
 */
export const searchUsers = async searchQuery => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { users: [], error: "No user logged in" };
    }

    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);

    const users = [];
    const queryLower = searchQuery.toLowerCase();

    // Collect matching user IDs first
    const matchingUsers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (
        doc.id !== currentUser.uid &&
        data.displayName?.toLowerCase().includes(queryLower)
      ) {
        matchingUsers.push({ uid: doc.id, data });
      }
    });

    // Fetch status for each matching user (profile stats are already in user data)
    for (const { uid, data } of matchingUsers) {
      // Get user status
      let status = "offline";
      try {
        const statusDoc = await getDoc(doc(db, "userStatus", uid));
        if (statusDoc.exists()) {
          status = statusDoc.data().status || "offline";
        }
      } catch (e) {
        console.warn("Failed to get status for user:", uid);
      }

      // Calculate stats from cloudLibrary games
      const games = data.cloudLibrary?.games || [];
      let totalPlaytime = 0;
      games.forEach(game => {
        totalPlaytime += game.playTime || 0;
      });

      // If user is private, don't include their stats
      const isPrivate = data.private || false;

      users.push({
        uid,
        displayName: data.displayName,
        photoURL: data.photoURL,
        bio: isPrivate ? null : data.bio || null,
        country: isPrivate ? null : data.country || null,
        verified: data.verified || false,
        owner: data.owner || false,
        contributor: data.contributor || false,
        private: isPrivate,
        status,
        level: isPrivate ? 0 : 1,
        totalPlaytime: isPrivate ? 0 : totalPlaytime,
        gamesPlayed: isPrivate ? 0 : games.length,
      });
    }

    return { users, error: null };
  } catch (error) {
    console.error("Search users error:", error);
    return { users: [], error: error.message };
  }
};

/**
 * Get a user's public profile with games and achievements
 * @param {string} userId - User ID to get profile for
 * @returns {Promise<{data: object|null, error: string|null}>}
 */
export const getUserPublicProfile = async userId => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { data: null, error: "No user logged in" };
    }

    // Get user basic data
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      return { data: null, error: "User not found" };
    }
    const userData = userDoc.data();

    // Get user status
    let status = "offline";
    try {
      const statusDoc = await getDoc(doc(db, "userStatus", userId));
      if (statusDoc.exists()) {
        status = statusDoc.data().status || "offline";
      }
    } catch (e) {
      console.warn("Failed to get status for user:", userId);
    }

    // Cloud library is stored inside the users document
    const cloudLibrary = userData.cloudLibrary || null;
    const games = cloudLibrary?.games || [];

    // Get profile stats (level, xp, etc.)
    const profileStats = userData.profileStats || {};

    // Calculate stats from cloud library games
    let totalPlaytime = profileStats.totalPlaytime || 0;
    let gamesPlayed = profileStats.gamesPlayed || games.length;

    // If no profileStats playtime, calculate from games
    if (!profileStats.totalPlaytime) {
      games.forEach(game => {
        totalPlaytime += game.playTime || 0;
      });
    }

    // Get achievement counts from cloudLibrary (subcollection has permission restrictions for other users)
    const totalAchievements = cloudLibrary?.totalAchievements || 0;
    const unlockedAchievements = cloudLibrary?.unlockedAchievements || 0;

    // Build achievements array from games data for display purposes
    let achievements = games
      .map(game => ({
        gameName: game.name,
        totalAchievements: game.totalAchievements || 0,
        unlockedAchievements: game.unlockedAchievements || 0,
        achievements: [], // Individual achievements not accessible for other users due to permissions
      }))
      .filter(g => g.totalAchievements > 0);

    // Check if we're friends with this user
    let isFriend = false;
    try {
      const friendsDoc = await getDoc(doc(db, "friends", currentUser.uid));
      if (friendsDoc.exists()) {
        isFriend = friendsDoc.data().list?.includes(userId) || false;
      }
    } catch (e) {
      console.warn("Failed to check friend status");
    }

    // Check if profile is private
    const isPrivate = userData.private || false;

    // If profile is private, only return minimal public info
    if (isPrivate) {
      return {
        data: {
          uid: userId,
          displayName: userData.displayName,
          photoURL: userData.photoURL,
          verified: userData.verified || false,
          owner: userData.owner || false,
          contributor: userData.contributor || false,
          isFriend,
          private: true,
        },
        error: null,
      };
    }

    return {
      data: {
        uid: userId,
        displayName: userData.displayName,
        photoURL: userData.photoURL,
        bio: userData.bio || null,
        country: userData.country || null,
        verified: userData.verified || false,
        owner: userData.owner || false,
        contributor: userData.contributor || false,
        socials: userData.socials || null,
        status,
        level: profileStats.level || 1,
        xp: profileStats.xp || 0,
        totalPlaytime,
        gamesPlayed,
        totalGames: gamesPlayed,
        joinDate: userData.createdAt || null,
        games,
        achievements,
        totalAchievements,
        unlockedAchievements,
        isFriend,
        private: false,
      },
      error: null,
    };
  } catch (error) {
    console.error("Get user public profile error:", error);
    return { data: null, error: error.message };
  }
};

/**
 * Send friend request
 * @param {string} toUid - User ID to send request to
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const sendFriendRequest = async toUid => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: "No user logged in" };
    }

    // Check if already friends
    const friendsDoc = await getDoc(doc(db, "friends", currentUser.uid));
    if (friendsDoc.exists() && friendsDoc.data().list?.includes(toUid)) {
      return { success: false, error: "Already friends" };
    }

    // Check if request already exists
    const requestsRef = collection(db, "friendRequests");
    const existingQuery = query(
      requestsRef,
      where("fromUid", "==", currentUser.uid),
      where("toUid", "==", toUid)
    );
    const existingSnapshot = await getDocs(existingQuery);
    if (!existingSnapshot.empty) {
      return { success: false, error: "Request already sent" };
    }

    // Check if they already sent us a request
    const reverseQuery = query(
      requestsRef,
      where("fromUid", "==", toUid),
      where("toUid", "==", currentUser.uid)
    );
    const reverseSnapshot = await getDocs(reverseQuery);
    if (!reverseSnapshot.empty) {
      return { success: false, error: "They already sent you a request" };
    }

    // Get current user's display name
    const currentUserDoc = await getDoc(doc(db, "users", currentUser.uid));
    const fromDisplayName = currentUserDoc.data()?.displayName || "Unknown";

    // Get target user's display name
    const toUserDoc = await getDoc(doc(db, "users", toUid));
    const toDisplayName = toUserDoc.data()?.displayName || "Unknown";

    // Create friend request
    await addDoc(collection(db, "friendRequests"), {
      fromUid: currentUser.uid,
      fromDisplayName,
      toUid,
      toDisplayName,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    return { success: true, error: null };
  } catch (error) {
    console.error("Send friend request error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Get incoming friend requests
 * @returns {Promise<{requests: array, error: string|null}>}
 */
export const getIncomingRequests = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { requests: [], error: "No user logged in" };
    }

    const requestsRef = collection(db, "friendRequests");
    const q = query(
      requestsRef,
      where("toUid", "==", currentUser.uid),
      where("status", "==", "pending")
    );
    const snapshot = await getDocs(q);

    const requests = [];
    snapshot.forEach(doc => {
      requests.push({ id: doc.id, ...doc.data() });
    });

    return { requests, error: null };
  } catch (error) {
    console.error("Get incoming requests error:", error);
    return { requests: [], error: error.message };
  }
};

/**
 * Get outgoing friend requests
 * @returns {Promise<{requests: array, error: string|null}>}
 */
export const getOutgoingRequests = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { requests: [], error: "No user logged in" };
    }

    const requestsRef = collection(db, "friendRequests");
    const q = query(
      requestsRef,
      where("fromUid", "==", currentUser.uid),
      where("status", "==", "pending")
    );
    const snapshot = await getDocs(q);

    const requests = [];
    snapshot.forEach(doc => {
      requests.push({ id: doc.id, ...doc.data() });
    });

    return { requests, error: null };
  } catch (error) {
    console.error("Get outgoing requests error:", error);
    return { requests: [], error: error.message };
  }
};

/**
 * Accept friend request
 * @param {string} requestId - Friend request document ID
 * @param {string} fromUid - User ID who sent the request
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const acceptFriendRequest = async (requestId, fromUid) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: "No user logged in" };
    }

    // Add to both users' friends lists
    const myFriendsRef = doc(db, "friends", currentUser.uid);
    const theirFriendsRef = doc(db, "friends", fromUid);

    // Get or create friends documents
    const myFriendsDoc = await getDoc(myFriendsRef);
    const theirFriendsDoc = await getDoc(theirFriendsRef);

    if (myFriendsDoc.exists()) {
      await updateDoc(myFriendsRef, { list: arrayUnion(fromUid) });
    } else {
      await setDoc(myFriendsRef, { list: [fromUid] });
    }

    if (theirFriendsDoc.exists()) {
      await updateDoc(theirFriendsRef, { list: arrayUnion(currentUser.uid) });
    } else {
      await setDoc(theirFriendsRef, { list: [currentUser.uid] });
    }

    // Delete the friend request
    await deleteDoc(doc(db, "friendRequests", requestId));

    return { success: true, error: null };
  } catch (error) {
    console.error("Accept friend request error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Deny/cancel friend request
 * @param {string} requestId - Friend request document ID
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const denyFriendRequest = async requestId => {
  try {
    await deleteDoc(doc(db, "friendRequests", requestId));
    return { success: true, error: null };
  } catch (error) {
    console.error("Deny friend request error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Get friends list with user data
 * @returns {Promise<{friends: array, error: string|null}>}
 */
export const getFriendsList = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { friends: [], error: "No user logged in" };
    }

    const friendsDoc = await getDoc(doc(db, "friends", currentUser.uid));
    if (!friendsDoc.exists() || !friendsDoc.data().list?.length) {
      return { friends: [], error: null };
    }

    const friendUids = friendsDoc.data().list;
    const friends = [];

    // Get user data for each friend
    for (const uid of friendUids) {
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        // Also get their status
        const statusDoc = await getDoc(doc(db, "userStatus", uid));
        const status = statusDoc.exists() ? statusDoc.data() : { status: "offline" };

        friends.push({
          uid,
          displayName: userData.displayName,
          photoURL: userData.photoURL,
          status: status.status,
          customMessage: status.customMessage,
          owner: userData.owner || false,
          contributor: userData.contributor || false,
          verified: userData.verified || false,
        });
      }
    }

    return { friends, error: null };
  } catch (error) {
    console.error("Get friends list error:", error);
    return { friends: [], error: error.message };
  }
};

/**
 * Remove friend
 * @param {string} friendUid - Friend's user ID
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const removeFriend = async friendUid => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: "No user logged in" };
    }

    // Remove from both users' friends lists
    const myFriendsRef = doc(db, "friends", currentUser.uid);
    const theirFriendsRef = doc(db, "friends", friendUid);

    await updateDoc(myFriendsRef, { list: arrayRemove(friendUid) });
    await updateDoc(theirFriendsRef, { list: arrayRemove(currentUser.uid) });

    return { success: true, error: null };
  } catch (error) {
    console.error("Remove friend error:", error);
    return { success: false, error: error.message };
  }
};

// ==================== MESSAGING ====================

/**
 * Get or create a conversation between two users
 * @param {string} otherUserId - The other user's ID
 * @returns {Promise<{conversationId: string|null, error: string|null}>}
 */
export const getOrCreateConversation = async otherUserId => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { conversationId: null, error: "No user logged in" };
    }

    // Create a consistent conversation ID (sorted user IDs)
    const participants = [currentUser.uid, otherUserId].sort();
    const conversationId = participants.join("_");

    const conversationRef = doc(db, "conversations", conversationId);
    const conversationDoc = await getDoc(conversationRef);

    if (!conversationDoc.exists()) {
      // Create new conversation
      await setDoc(conversationRef, {
        participants,
        createdAt: serverTimestamp(),
        lastMessage: null,
        lastMessageAt: serverTimestamp(),
      });
    }

    return { conversationId, error: null };
  } catch (error) {
    console.error("Get/create conversation error:", error);
    return { conversationId: null, error: error.message };
  }
};

/**
 * Send a message in a conversation
 * @param {string} conversationId - Conversation ID
 * @param {string} text - Message text
 * @returns {Promise<{success: boolean, messageId: string|null, error: string|null}>}
 */
export const sendMessage = async (conversationId, text) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, messageId: null, error: "No user logged in" };
    }

    if (!text.trim()) {
      return { success: false, messageId: null, error: "Message cannot be empty" };
    }

    // Add message to messages subcollection
    const messagesRef = collection(db, "conversations", conversationId, "messages");
    const messageDoc = await addDoc(messagesRef, {
      senderId: currentUser.uid,
      text: text.trim(),
      createdAt: serverTimestamp(),
      read: false,
    });

    // Update conversation's last message
    const conversationRef = doc(db, "conversations", conversationId);
    await updateDoc(conversationRef, {
      lastMessage: text.trim(),
      lastMessageSenderId: currentUser.uid,
      lastMessageAt: serverTimestamp(),
    });

    return { success: true, messageId: messageDoc.id, error: null };
  } catch (error) {
    console.error("Send message error:", error);
    return { success: false, messageId: null, error: error.message };
  }
};

/**
 * Get all conversations for the current user
 * @returns {Promise<{conversations: array, error: string|null}>}
 */
export const getConversations = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { conversations: [], error: "No user logged in" };
    }

    const conversationsRef = collection(db, "conversations");
    const q = query(
      conversationsRef,
      where("participants", "array-contains", currentUser.uid)
    );
    const snapshot = await getDocs(q);

    const conversations = [];
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const otherUserId = data.participants.find(id => id !== currentUser.uid);

      // Get other user's data
      const userDoc = await getDoc(doc(db, "users", otherUserId));
      const userData = userDoc.exists()
        ? userDoc.data()
        : { displayName: "Unknown User" };

      // Get other user's status
      const statusDoc = await getDoc(doc(db, "userStatus", otherUserId));
      const status = statusDoc.exists() ? statusDoc.data().status : "offline";

      // Count unread messages (fetch all and filter client-side to avoid index)
      const messagesRef = collection(db, "conversations", docSnap.id, "messages");
      const messagesSnapshot = await getDocs(messagesRef);
      const unreadCount = messagesSnapshot.docs.filter(msgDoc => {
        const msgData = msgDoc.data();
        return msgData.senderId !== currentUser.uid && msgData.read === false;
      }).length;

      conversations.push({
        id: docSnap.id,
        otherUser: {
          uid: otherUserId,
          displayName: userData.displayName,
          photoURL: userData.photoURL,
          status,
          owner: userData.owner || false,
          contributor: userData.contributor || false,
          verified: userData.verified || false,
        },
        lastMessage: data.lastMessage,
        lastMessageSenderId: data.lastMessageSenderId,
        lastMessageAt: data.lastMessageAt?.toDate(),
        unreadCount,
      });
    }

    // Sort by last message time
    conversations.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

    return { conversations, error: null };
  } catch (error) {
    console.error("Get conversations error:", error);
    return { conversations: [], error: error.message };
  }
};

/**
 * Get messages for a conversation (only from the last 7 days)
 * @param {string} conversationId - Conversation ID
 * @param {number} limitCount - Max messages to fetch
 * @returns {Promise<{messages: array, error: string|null}>}
 */
export const getMessages = async (conversationId, limitCount = 100) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { messages: [], error: "No user logged in" };
    }

    // Calculate 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);

    const messagesRef = collection(db, "conversations", conversationId, "messages");
    const q = query(
      messagesRef,
      where("createdAt", ">=", sevenDaysAgoTimestamp),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);

    const messages = snapshot.docs
      .map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate(),
        isOwn: docSnap.data().senderId === currentUser.uid,
      }))
      .reverse();

    return { messages, error: null };
  } catch (error) {
    console.error("Get messages error:", error);
    return { messages: [], error: error.message };
  }
};

/**
 * Delete old messages (older than 7 days) from a conversation
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<{success: boolean, deletedCount: number, error: string|null}>}
 */
export const deleteOldMessages = async conversationId => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, deletedCount: 0, error: "No user logged in" };
    }

    // Calculate 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);

    const messagesRef = collection(db, "conversations", conversationId, "messages");
    const q = query(messagesRef, where("createdAt", "<", sevenDaysAgoTimestamp));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return { success: true, deletedCount: 0, error: null };
    }

    // Delete in batches of 500 (Firestore limit)
    const batch = writeBatch(db);
    let deletedCount = 0;

    snapshot.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
      deletedCount++;
    });

    await batch.commit();
    console.log(
      `Deleted ${deletedCount} old messages from conversation ${conversationId}`
    );

    return { success: true, deletedCount, error: null };
  } catch (error) {
    console.error("Delete old messages error:", error);
    return { success: false, deletedCount: 0, error: error.message };
  }
};

/**
 * Clean up old messages from all user's conversations
 * @returns {Promise<{success: boolean, totalDeleted: number, error: string|null}>}
 */
export const cleanupAllOldMessages = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, totalDeleted: 0, error: "No user logged in" };
    }

    // Get all conversations for the user
    const conversationsRef = collection(db, "conversations");
    const q = query(
      conversationsRef,
      where("participants", "array-contains", currentUser.uid)
    );
    const snapshot = await getDocs(q);

    let totalDeleted = 0;

    for (const docSnap of snapshot.docs) {
      const result = await deleteOldMessages(docSnap.id);
      if (result.success) {
        totalDeleted += result.deletedCount;
      }
    }

    return { success: true, totalDeleted, error: null };
  } catch (error) {
    console.error("Cleanup all old messages error:", error);
    return { success: false, totalDeleted: 0, error: error.message };
  }
};

/**
 * Mark messages as read in a conversation
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export const markMessagesAsRead = async conversationId => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: "No user logged in" };
    }

    const messagesRef = collection(db, "conversations", conversationId, "messages");
    const snapshot = await getDocs(messagesRef);

    // Filter client-side to avoid composite index
    const unreadMessages = snapshot.docs.filter(docSnap => {
      const data = docSnap.data();
      return data.senderId !== currentUser.uid && data.read === false;
    });

    if (unreadMessages.length > 0) {
      const batch = writeBatch(db);
      unreadMessages.forEach(docSnap => {
        batch.update(docSnap.ref, { read: true });
      });
      await batch.commit();
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("Mark messages as read error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Get total unread message count across all conversations
 * @returns {Promise<{count: number, newMessages: array, error: string|null}>}
 */
export const getUnreadMessageCount = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { count: 0, newMessages: [], error: "No user logged in" };
    }

    const conversationsRef = collection(db, "conversations");
    const q = query(
      conversationsRef,
      where("participants", "array-contains", currentUser.uid)
    );
    const snapshot = await getDocs(q);

    let totalUnread = 0;
    const newMessages = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const otherUserId = data.participants.find(id => id !== currentUser.uid);

      // Count unread messages (fetch all and filter client-side to avoid index)
      const messagesRef = collection(db, "conversations", docSnap.id, "messages");
      const messagesSnapshot = await getDocs(messagesRef);
      const unreadMessages = messagesSnapshot.docs.filter(msgDoc => {
        const msgData = msgDoc.data();
        return msgData.senderId !== currentUser.uid && msgData.read === false;
      });

      if (unreadMessages.length > 0) {
        totalUnread += unreadMessages.length;

        // Get sender info for notifications
        const userDoc = await getDoc(doc(db, "users", otherUserId));
        const userData = userDoc.exists() ? userDoc.data() : { displayName: "Someone" };

        // Get the latest unread message
        const latestMessage = unreadMessages
          .map(d => ({ ...d.data(), id: d.id }))
          .sort(
            (a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)
          )[0];

        newMessages.push({
          conversationId: docSnap.id,
          senderId: otherUserId,
          senderName: userData.displayName,
          senderPhoto: userData.photoURL,
          messageText: latestMessage?.text,
          unreadCount: unreadMessages.length,
        });
      }
    }

    return { count: totalUnread, newMessages, error: null };
  } catch (error) {
    console.error("Get unread count error:", error);
    return { count: 0, newMessages: [], error: error.message };
  }
};

/**
 * Convert Firebase error codes to user-friendly messages
 * @param {string} errorCode - Firebase error code
 * @returns {string} User-friendly error message
 */
const getErrorMessage = errorCode => {
  const errorMessages = {
    "auth/email-already-in-use": "This email is already registered",
    "auth/invalid-email": "Invalid email address",
    "auth/operation-not-allowed": "Operation not allowed",
    "auth/weak-password": "Password is too weak",
    "auth/user-disabled": "This account has been disabled",
    "auth/user-not-found": "No account found with this email",
    "auth/wrong-password": "Incorrect password",
    "auth/invalid-credential": "Invalid credentials",
    "auth/too-many-requests": "Too many attempts. Please try again later",
    "auth/network-request-failed": "Network error. Please check your connection",
    "auth/requires-recent-login": "Please log in again to perform this action",
  };

  return errorMessages[errorCode] || "An unexpected error occurred";
};

/**
 * Get all notifications from the notifications collection
 * @returns {Promise<{notifications: array, error: string|null}>}
 */
export const getNotifications = async () => {
  try {
    const notificationsRef = collection(db, "notifications");
    const snapshot = await getDocs(notificationsRef);

    const notifications = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    return { notifications, error: null };
  } catch (error) {
    console.error("Get notifications error:", error);
    return { notifications: [], error: error.message };
  }
};

// Export Firebase instances for advanced usage
export { app, auth, db, analytics };
