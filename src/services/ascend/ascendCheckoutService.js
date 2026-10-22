import { userAuthenticatedFetch } from "@/utils/authHelper";

const pendingUsers = new Set();

// Shared by every purchase entry point, including the lifetime offer dialog.
export async function openAscendCheckout(user, priceId) {
  if (!user?.uid) throw new Error("Please sign in before purchasing Ascend.");
  if (pendingUsers.has(user.uid)) {
    throw new Error("Checkout is already opening. Please wait.");
  }
  pendingUsers.add(user.uid);
  try {
    const response = await userAuthenticatedFetch(
      user,
      "https://api.ascendara.app/stripe/create-checkout-session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.uid, priceId }),
      }
    );
    const result = await response.json();
    if (!response.ok || !result.url) {
      throw new Error(result.error || "Unable to open checkout. Please try again.");
    }
    if (!window.electron?.openURL)
      throw new Error("Unable to open the checkout browser.");
    await window.electron.openURL(result.url);
    return true;
  } finally {
    pendingUsers.delete(user.uid);
  }
}
