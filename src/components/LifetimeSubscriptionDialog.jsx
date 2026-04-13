import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Crown, Sparkles, Zap, Loader2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getAuthToken } from "@/utils/authHelper";

const LifetimeSubscriptionDialog = ({ launchCount }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, userData } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const [showRedirectDialog, setShowRedirectDialog] = useState(false);
  const [discountInfo, setDiscountInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (!user?.uid || hasCheckedRef.current || !launchCount) return;

    const checkLifetimeEligibility = async () => {
      try {
        const subscription = userData?.ascendSubscription;
        
        // Show dialog for both non-subscribers and active subscribers without lifetime
        const shouldShowDialog = 
          !subscription?.active || // No active subscription
          (subscription?.active === true && subscription?.lifetime !== true); // Active but not lifetime
        
        // Only show after 5 launches (a couple days of usage)
        if (shouldShowDialog && !hasCheckedRef.current && launchCount >= 5) {
          hasCheckedRef.current = true;
          
          // Fetch discount information from API only if user has active subscription
          if (subscription?.active === true) {
            try {
              const token = await user.getIdToken();
              const response = await fetch('https://api.ascendara.app/stripe/calculate-lifetime-discount', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ userId: user.uid })
              });
              
              if (response.ok) {
                const data = await response.json();
                setDiscountInfo(data);
                console.log('[LifetimeDialog] Discount info:', data);
              }
            } catch (error) {
              console.error('[LifetimeDialog] Error fetching discount:', error);
            }
          }
          
          setLoading(false);
          
          // Show dialog after a delay to let app initialize
          setTimeout(() => {
            setShowDialog(true);
          }, 4000); // 4 second delay
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("[LifetimeDialog] Error checking eligibility:", error);
        setLoading(false);
      }
    };

    checkLifetimeEligibility();
  }, [user?.uid, userData, launchCount]);

  const handleUpgrade = async (isLifetime = true) => {
    try {
      setShowDialog(false);
      setShowRedirectDialog(true);
      
      // Get auth token using the helper function
      const authToken = await getAuthToken();
      
      // Determine which price ID to use
      const priceId = isLifetime 
        ? "price_1TKjjMCfu5zjwIKZyrWXZFJ1" // Lifetime
        : "price_1QnMnNCfu5zjwIKZFbCRwBHd"; // Monthly $1.50
      
      // Use the discount amount we already fetched (only for lifetime upgrades)
      const discountAmount = isLifetime ? (discountInfo?.discount || 0) : 0;
      
      // Create checkout session
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
            discountAmount: discountAmount,
            successUrl: "https://ascendara.app/thank-you?subscription=success",
            cancelUrl: "ascendara://checkout-canceled",
          }),
        }
      );
      
      if (response.ok) {
        const { url } = await response.json();
        window.electron?.openURL?.(url);
      } else if (response.status === 401) {
        // Token expired or invalid, retry with a fresh token
        console.log("Token expired, retrying with fresh token...");
        const newToken = await getAuthToken();
        const retryResponse = await fetch(
          "https://api.ascendara.app/stripe/create-checkout-session",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newToken}`,
            },
            body: JSON.stringify({
              userId: user.uid,
              priceId: priceId,
              discountAmount: discountAmount,
              successUrl: "https://ascendara.app/thank-you?subscription=success",
              cancelUrl: "ascendara://checkout-canceled",
            }),
          }
        );
        
        if (retryResponse.ok) {
          const { url } = await retryResponse.json();
          window.electron?.openURL?.(url);
        } else {
          console.error("Failed to create checkout session after retry");
          setShowRedirectDialog(false);
        }
      } else {
        console.error("Failed to create checkout session:", response.status);
        setShowRedirectDialog(false);
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      setShowRedirectDialog(false);
    }
  };

  const handleDismiss = () => {
    setShowDialog(false);
    // Mark as dismissed to prevent showing again
    localStorage.setItem("lifetimeDialogDismissed", "true");
  };

  // Don't show if already dismissed
  useEffect(() => {
    if (localStorage.getItem("lifetimeDialogDismissed") === "true") {
      hasCheckedRef.current = true;
    }
  }, []);
  
  // Auto-close redirect dialog after 10 seconds
  useEffect(() => {
    if (showRedirectDialog) {
      const timer = setTimeout(() => {
        setShowRedirectDialog(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [showRedirectDialog]);

  if (!showDialog && !showRedirectDialog) return null;

  const subscription = userData?.ascendSubscription;
  const hasActiveSubscription = subscription?.active === true;

  return (
    <>
    <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            {hasActiveSubscription
              ? t("ascend.settings.lifetimeDialog.title", "Sounds like there's a deal...")
              : t("ascend.settings.lifetimeDialog.titleNoSub", "Join Ascend Today")}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2 text-sm font-medium text-yellow-800 dark:text-yellow-200">
                <Sparkles className="h-4 w-4" />
                {t("ascend.settings.lifetimeDialog.limitedTime", "Limited Time Offer")}
              </div>
              {hasActiveSubscription && discountInfo?.discount > 0 && (
                <div className="mt-2 text-lg font-bold text-yellow-900 dark:text-yellow-100">
                  {t("ascend.settings.lifetimeDialog.saveAmount", { amount: discountInfo.discount })}
                </div>
              )}
            </div>
            
            {hasActiveSubscription ? (
              <>
                <p className="text-sm">
                  {discountInfo?.discount > 0 
                    ? t("ascend.settings.lifetimeDialog.descriptionWithDiscount", { 
                        tier: discountInfo.subscriptionTier, 
                        amount: discountInfo.discount 
                      })
                    : t("ascend.settings.lifetimeDialog.description", "You're currently on a recurring subscription. Upgrade to Lifetime Ascend and pay once, forever!")
                  }
                </p>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-green-500" />
                    <span>{t("ascend.settings.lifetimeDialog.benefit1", "One-time payment, lifetime access")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-green-500" />
                    <span>{t("ascend.settings.lifetimeDialog.benefit2", "Never worry about renewals again")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-green-500" />
                    <span>{t("ascend.settings.lifetimeDialog.benefit3", "All future updates included")}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm">
                  {t("ascend.settings.lifetimeDialog.descriptionNoSub", "Unlock premium features with Ascend! Start with a 7-day free trial, then just $1.50/month.")}
                </p>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-green-500" />
                    <span>{t("ascend.settings.lifetimeDialog.benefitTrial", "7-day free trial included")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-green-500" />
                    <span>{t("ascend.settings.lifetimeDialog.benefitPrice", "Only $1.50/month after trial")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Zap className="h-4 w-4 text-green-500" />
                    <span>{t("ascend.settings.lifetimeDialog.benefitLifetimeOption", "Or upgrade to lifetime for a one-time payment")}</span>
                  </div>
                </div>
              </>
            )}
            
            <p className="text-xs text-muted-foreground italic">
              {t("ascend.settings.lifetimeDialog.disclaimer", "This special offer is available for a limited time only. Don't miss out!")}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDismiss}>
            {t("common.maybeLater", "Maybe Later")}
          </AlertDialogCancel>
          {hasActiveSubscription ? (
            <AlertDialogAction onClick={() => handleUpgrade(true)} className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 text-secondary hover:to-orange-600">
              {t("ascend.settings.lifetimeDialog.upgradeToLifetime", "Upgrade to Lifetime")}
            </AlertDialogAction>
          ) : (
            <AlertDialogAction onClick={() => navigate('/ascend')} className="bg-primary hover:bg-primary/90">
              {t("ascend.settings.lifetimeDialog.startTrial", "Start Free Trial")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    
    {/* Redirect Loading Dialog */}
    <AlertDialog open={showRedirectDialog} onOpenChange={setShowRedirectDialog}>
      <AlertDialogContent className="max-w-md border-border/50 bg-background">
        <button
          onClick={() => setShowRedirectDialog(false)}
          className="absolute right-4 top-4 z-10 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        
        <div className="flex flex-col items-center justify-center space-y-4 py-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <AlertDialogHeader className="text-center">
            <AlertDialogTitle className="text-xl font-bold text-primary">
              {t("ascend.settings.subscriptionDialogV2.redirectingToCheckout")}
            </AlertDialogTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("ascend.settings.subscriptionDialogV2.completeCheckoutMessage")}
            </p>
          </AlertDialogHeader>
        </div>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default LifetimeSubscriptionDialog;
