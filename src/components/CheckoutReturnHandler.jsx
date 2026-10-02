import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { userAuthenticatedFetch } from "@/utils/authHelper";

// Checkout can return on any page, including while Firebase is restoring login.
export default function CheckoutReturnHandler() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [sessions, setSessions] = useState([]);
  const sessionId = sessions[0];

  useEffect(() => {
    let disposed = false;
    const enqueue = id => {
      if (!disposed && typeof id === "string" && /^cs_[A-Za-z0-9_]{1,255}$/.test(id)) {
        setSessions(current => current.includes(id) ? current : [...current, id]);
      }
    };
    // Subscribe before reading the queue so startup callbacks cannot be lost.
    const unsubscribe = window.electron?.onCheckoutSuccess?.(data => enqueue(data?.sessionId));
    const unsubscribeCanceled = window.electron?.onCheckoutCanceled?.(() => {
      toast.info(t("ascend.settings.checkoutCanceled"));
    });
    window.electron?.getPendingCheckouts?.().then(ids => ids.forEach(enqueue)).catch(error => {
      console.error("Unable to read pending checkouts:", error);
    });
    return () => {
      disposed = true;
      unsubscribe?.();
      unsubscribeCanceled?.();
    };
  }, [t]);

  useEffect(() => {
    if (!sessionId || !user?.uid || typeof user.getIdToken !== "function") return;
    let disposed = false;
    let retryTimer;
    let requestTimer;
    let controller;
    let toastSettled = false;
    const toastId = `checkout-${sessionId}`;
    toast.loading(t("ascend.settings.verifyingPayment", "Verifying your payment, please wait..."), { id: toastId });

    const verify = async attempt => {
      controller = new AbortController();
      requestTimer = setTimeout(() => controller.abort(), 15000);
      let retryable = true;
      try {
        const response = await userAuthenticatedFetch(user,
          "https://api.ascendara.app/stripe/verify-checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, userId: user.uid }),
            signal: controller.signal,
          });
        if (disposed) return;
        retryable = response.ok || response.status === 429 || response.status >= 500;
        const data = await response.json();
        if (disposed) return;
        if (response.ok && data.success) {
          // Firestore's existing real-time listener refreshes account data globally.
          window.dispatchEvent(new CustomEvent("ascendara:checkout-verified"));
          toast.success(t("ascend.settings.subscriptionSuccessMessage"), { id: toastId });
          toastSettled = true;
          window.electron?.acknowledgeCheckout?.(sessionId).catch(console.error);
          setSessions(current => current.filter(id => id !== sessionId));
          return;
        }
      } catch (error) {
        if (!disposed) console.error("Checkout verification failed:", error);
      } finally {
        clearTimeout(requestTimer);
      }
      if (disposed) return;
      if (retryable && attempt < 5) {
        retryTimer = setTimeout(() => verify(attempt + 1), Math.min(2000 * 2 ** attempt, 10000));
      } else {
        toast.error(t("ascend.settings.verifyCheckoutRetryFailed",
          "Unable to verify your payment. Please reopen the checkout return link to retry, or contact support if you were charged."),
        { id: toastId, duration: 10000 });
        toastSettled = true;
        // Leave the main-process queue intact so a renderer reload can retry.
        setSessions(current => current.filter(id => id !== sessionId));
      }
    };
    verify(0);
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(requestTimer);
      controller?.abort();
      if (!toastSettled) toast.dismiss(toastId);
    };
  }, [sessionId, user, t]);

  return null;
}
