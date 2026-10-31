/**
 * newFeatureBadgeService.js
 *
 * Points signed-in members at two-step verification once it ships: a count on
 * the Ascend nav button and on Settings in the account menu, and a "New" tag
 * on the Security settings page. Opening that page clears all of them, and
 * accounts that already have two-step verification on never see them.
 *
 * Whether it's been seen lives in `ascend-new-feature-seen:twoFactor:{uid}` on
 * this device, so it may show once more on another computer.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getCurrentUser, getTwoFactorStatus } from "@/services/firebase/firebaseService";

const SEEN_EVENT = "ascend-new-feature-seen";
const seenKey = uid => `ascend-new-feature-seen:twoFactor:${uid}`;

function hasSeen(uid) {
  try {
    return localStorage.getItem(seenKey(uid)) === "1";
  } catch {
    return false;
  }
}

/** Clear the new-feature badges for this account */
export function markSecurityFeatureSeen(uid) {
  if (!uid || hasSeen(uid)) return;
  try {
    localStorage.setItem(seenKey(uid), "1");
  } catch {
    /* The badge just comes back next time. */
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** True while the signed-in member hasn't looked at two-step verification yet */
export function useNewSecurityFeature() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!uid) {
      setShow(false);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      if (hasSeen(uid)) {
        setShow(false);
        return;
      }
      const current = getCurrentUser();
      const status = current ? await getTwoFactorStatus(current).catch(() => null) : null;
      if (!cancelled) setShow(Boolean(status) && !status.enabled && !hasSeen(uid));
    };
    refresh();
    window.addEventListener(SEEN_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(SEEN_EVENT, refresh);
    };
  }, [uid]);

  return show;
}
