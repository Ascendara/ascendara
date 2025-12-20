import React, { createContext, useContext, useState, useEffect } from "react";
import {
  subscribeToAuthChanges,
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  resetPassword,
  updateUserProfile,
  changePassword,
  deleteAccount,
  getUserData,
  updateUserData,
  resendVerificationEmail,
  reloadCurrentUser,
  signInWithGoogle,
  updateUserStatus,
} from "@/services/firebaseService";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    // Return default values instead of throwing to prevent crashes
    console.warn("useAuth called outside of AuthProvider, using defaults");
    return {
      user: null,
      userData: null,
      loading: false,
      error: null,
      isAuthenticated: false,
      isEmailVerified: false,
      register: async () => ({ success: false, error: "Auth not available" }),
      login: async () => ({ success: false, error: "Auth not available" }),
      logout: async () => ({ success: false, error: "Auth not available" }),
      googleSignIn: async () => ({ success: false, error: "Auth not available" }),
      forgotPassword: async () => ({ success: false, error: "Auth not available" }),
      updateProfile: async () => ({ success: false, error: "Auth not available" }),
      updatePassword: async () => ({ success: false, error: "Auth not available" }),
      removeAccount: async () => ({ success: false, error: "Auth not available" }),
      updateData: async () => ({ success: false, error: "Auth not available" }),
      resendVerificationEmail: async () => ({
        success: false,
        error: "Auth not available",
      }),
      reloadUser: async () => ({ success: false, error: "Auth not available" }),
      clearError: () => {},
    };
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Subscribe to auth state changes
  useEffect(() => {
    let unsubscribe = () => {};

    try {
      unsubscribe = subscribeToAuthChanges(async firebaseUser => {
        try {
          if (firebaseUser) {
            // Fetch additional user data from Firestore
            const { data } = await getUserData(firebaseUser.uid);

            // Check if account has pending deletion request
            if (data?.reqDelete) {
              // Sign out and show warning
              await logoutUser();
              setUser(null);
              setUserData(null);
              setError("ACCOUNT_PENDING_DELETION");
              setLoading(false);
              return;
            }

            setUser(firebaseUser);
            setUserData(data);
          } else {
            setUser(null);
            setUserData(null);
          }
        } catch (err) {
          console.error("Error in auth state change handler:", err);
          setUserData(null);
        } finally {
          setLoading(false);
        }
      });
    } catch (err) {
      console.error("Error subscribing to auth changes:", err);
      setLoading(false);
    }

    return () => unsubscribe();
  }, []);

  // Register new user
  const register = async (email, password, displayName, hardwareId = null) => {
    setError(null);
    const result = await registerUser(email, password, displayName, hardwareId);
    if (result.error) {
      setError(result.error);
    }
    return result;
  };

  // Login user
  const login = async (email, password) => {
    setError(null);
    const result = await loginUser(email, password);
    if (result.error) {
      setError(result.error);
    }
    return result;
  };

  // Logout user
  const logout = async () => {
    setError(null);
    // Set status to invisible before logging out (don't block on errors)
    try {
      await updateUserStatus("invisible");
    } catch (e) {
      console.error("Failed to set status on logout:", e);
    }
    const result = await logoutUser();
    if (result.error) {
      setError(result.error);
    }
    return result;
  };

  // Reset password
  const forgotPassword = async email => {
    setError(null);
    const result = await resetPassword(email);
    if (result.error) {
      setError(result.error);
    }
    return result;
  };

  // Update profile
  const updateProfile = async profileData => {
    setError(null);
    const result = await updateUserProfile(profileData);
    if (result.error) {
      setError(result.error);
    } else if (user) {
      // Refresh user data
      const { data } = await getUserData(user.uid);
      setUserData(data);
    }
    return result;
  };

  // Change password
  const updatePassword = async (currentPassword, newPassword) => {
    setError(null);
    const result = await changePassword(currentPassword, newPassword);
    if (result.error) {
      setError(result.error);
    }
    return result;
  };

  // Delete account (request deletion and sign out)
  const removeAccount = async password => {
    setError(null);
    const result = await deleteAccount(password);
    if (result.error) {
      setError(result.error);
    } else if (result.success) {
      // Sign out after successful deletion request
      await logoutUser();
    }
    return result;
  };

  // Update user data in Firestore
  const updateData = async data => {
    setError(null);
    if (!user) {
      setError("No user logged in");
      return { success: false, error: "No user logged in" };
    }
    const result = await updateUserData(user.uid, data);
    if (result.error) {
      setError(result.error);
    } else {
      // Refresh user data
      const { data: newData } = await getUserData(user.uid);
      setUserData(newData);
    }
    return result;
  };

  // Resend verification email
  const resendVerification = async () => {
    setError(null);
    const result = await resendVerificationEmail();
    if (result.error) {
      setError(result.error);
    }
    return result;
  };

  // Google sign-in
  const googleSignIn = async () => {
    setError(null);
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error);
    }
    return result;
  };

  // Reload user to refresh emailVerified status
  const reloadUser = async () => {
    const result = await reloadCurrentUser();
    if (result.success && result.user) {
      const u = result.user;
      // Create a plain object with user properties to trigger React state update
      setUser({
        uid: u.uid,
        email: u.email,
        emailVerified: u.emailVerified,
        displayName: u.displayName,
        photoURL: u.photoURL,
        providerData: u.providerData,
        metadata: u.metadata,
      });
    }
    return result;
  };

  // Clear error
  const clearError = () => setError(null);

  const value = {
    // State
    user,
    userData,
    loading,
    error,
    isAuthenticated: !!user,
    isEmailVerified: user?.emailVerified ?? false,

    // Actions
    register,
    login,
    logout,
    googleSignIn,
    forgotPassword,
    updateProfile,
    updatePassword,
    removeAccount,
    updateData,
    resendVerificationEmail: resendVerification,
    reloadUser,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
