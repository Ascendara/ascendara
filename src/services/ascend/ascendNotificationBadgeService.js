/**
 * ascendNotificationBadgeService.js
 *
 * Counts the Ascend notifications the signed-in user hasn't looked at yet, for
 * the badge on the Ascend nav button. Every source the Notifications section
 * shows counts: announcements, playtime flags, review likes and wishlist
 * matches. Opening that section marks everything in it as seen.
 *
 * Seen and archived ids live in `ascend-notifications-state:{uid}` and are
 * mirrored to the account (users/{uid}/private/uiState), so they follow the
 * user to other devices; archived notifications never count. The first time it runs,
 * announcements older than two weeks are treated as seen, so long-time users
 * aren't greeted with a badge for every announcement ever posted.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getAscendUiState,
  getNotifications,
  listMemberNotifications,
  listPlaytimeFlags,
  saveAscendUiState,
} from "@/services/firebase/firebaseService";
import { getWishlistMatches, WISHLIST_MATCHES_EVENT } from "./wishlistWatchService";

export const NOTIFICATIONS_SEEN_EVENT = "ascend-notifications-seen";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const FOCUS_MIN_INTERVAL_MS = 60 * 1000;
const BASELINE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CLOUD_SAVE_DELAY_MS = 2000;

const stateKey = uid => `ascend-notifications-state:${uid}`;

// Ids shared by the badge and the Notifications section
export const notificationKeys = {
  announcement: item => `announcement:${item.id}`,
  flag: item => `flag:${item.id}`,
  member: item => `member:${item.id}`,
  wishlist: item => `wishlist:${item.id}`,
};

/** { seen, archived } as Sets, or null before the first check on this device */
export function readNotificationState(uid) {
  try {
    const parsed = JSON.parse(localStorage.getItem(stateKey(uid)) || "null");
    if (!parsed || !Array.isArray(parsed.seen)) return null;
    return {
      seen: new Set(parsed.seen),
      archived: new Set(Array.isArray(parsed.archived) ? parsed.archived : []),
    };
  } catch {
    return null;
  }
}

function writeLocalState(uid, state) {
  try {
    localStorage.setItem(
      stateKey(uid),
      JSON.stringify({ seen: [...state.seen], archived: [...state.archived] })
    );
  } catch {
    /* The cloud copy still has it. */
  }
  window.dispatchEvent(new Event(NOTIFICATIONS_SEEN_EVENT));
}

// Opening the section writes on every list change, so cloud saves are batched
const pendingCloudSaves = new Map();

function saveCloudState(uid, state) {
  clearTimeout(pendingCloudSaves.get(uid));
  pendingCloudSaves.set(
    uid,
    setTimeout(() => {
      pendingCloudSaves.delete(uid);
      saveAscendUiState(uid, {
        notificationsSeen: [...state.seen],
        notificationsArchived: [...state.archived],
      });
    }, CLOUD_SAVE_DELAY_MS)
  );
}

function writeNotificationState(uid, state) {
  writeLocalState(uid, state);
  saveCloudState(uid, state);
}

const cloudPulls = new Map();

/**
 * Bring this device's state in line with the account's, once per session.
 * The account copy wins; a device that has state the account lacks (from
 * before syncing existed) uploads it instead. A failed read is retried on
 * the next call.
 */
export function syncNotificationState(uid) {
  if (!uid) return Promise.resolve();
  if (!cloudPulls.has(uid)) {
    const pull = getAscendUiState(uid).then(({ ok, state: cloud }) => {
      if (!ok) {
        cloudPulls.delete(uid);
        return;
      }
      if (Array.isArray(cloud?.notificationsSeen)) {
        writeLocalState(uid, {
          seen: new Set(cloud.notificationsSeen),
          archived: new Set(cloud.notificationsArchived || []),
        });
      } else {
        const local = readNotificationState(uid);
        if (local) saveCloudState(uid, local);
      }
    });
    cloudPulls.set(uid, pull);
  }
  return cloudPulls.get(uid);
}

const emptyState = () => ({ seen: new Set(), archived: new Set() });

// Every notification the section would show, as { id, at }
async function currentNotifications() {
  const [global, flags, member] = await Promise.all([
    getNotifications().catch(() => ({ notifications: [] })),
    listPlaytimeFlags().catch(() => ({ flags: [] })),
    listMemberNotifications().catch(() => ({ notifications: [] })),
  ]);
  return [
    ...(global.notifications || []).map(item => ({
      id: notificationKeys.announcement(item),
      at: item.timestamp,
    })),
    ...(flags.flags || []).map(item => ({ id: notificationKeys.flag(item) })),
    ...(member.notifications || [])
      .filter(item => item.kind === "reviewLike")
      .map(item => ({ id: notificationKeys.member(item) })),
    ...getWishlistMatches().map(item => ({ id: notificationKeys.wishlist(item) })),
  ];
}

async function unseenCount(uid) {
  const [notifications] = await Promise.all([
    currentNotifications(),
    syncNotificationState(uid),
  ]);
  let state = readNotificationState(uid);
  if (!state) {
    const cutoff = Date.now() - BASELINE_AGE_MS;
    state = emptyState();
    for (const item of notifications) {
      if (!item.id.startsWith("announcement:")) continue;
      const at = new Date(item.at?.toDate?.() ?? item.at ?? 0).getTime();
      if (!Number.isFinite(at) || at < cutoff) state.seen.add(item.id);
    }
    writeNotificationState(uid, state);
  }
  return notifications.filter(
    item => !state.seen.has(item.id) && !state.archived.has(item.id)
  ).length;
}

/**
 * Mark the given notifications as seen. Ids that are no longer shown are
 * dropped, so the stored lists don't grow forever.
 */
export function markNotificationsSeen(uid, ids) {
  if (!uid) return;
  const state = readNotificationState(uid) || emptyState();
  const shown = new Set(ids);
  writeNotificationState(uid, {
    seen: shown,
    archived: new Set([...state.archived].filter(id => shown.has(id))),
  });
}

/** Archive (or bring back) notifications on this device */
export function setNotificationsArchived(uid, ids, archived) {
  if (!uid) return;
  const state = readNotificationState(uid) || emptyState();
  for (const id of ids) {
    state.seen.add(id);
    if (archived) state.archived.add(id);
    else state.archived.delete(id);
  }
  writeNotificationState(uid, state);
}

/** Unseen Ascend notifications for the signed-in user (0 when signed out) */
export function useAscendNotificationCount() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setCount(0);
      return;
    }
    let cancelled = false;
    let lastRefresh = 0;
    const refresh = () => {
      lastRefresh = Date.now();
      unseenCount(uid)
        .then(next => !cancelled && setCount(next))
        .catch(() => {});
    };
    const handleFocus = () => {
      if (Date.now() - lastRefresh > FOCUS_MIN_INTERVAL_MS) refresh();
    };

    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", handleFocus);
    window.addEventListener(WISHLIST_MATCHES_EVENT, refresh);
    window.addEventListener(NOTIFICATIONS_SEEN_EVENT, refresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(WISHLIST_MATCHES_EVENT, refresh);
      window.removeEventListener(NOTIFICATIONS_SEEN_EVENT, refresh);
    };
  }, [uid]);

  return count;
}
