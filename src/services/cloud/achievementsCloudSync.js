/**
 * achievementsCloudSync.js
 *
 * Keeps achievement unlocks in sync across devices via the user's Ascend
 * cloud (`users/{uid}/gameAchievements/{gameName}`).
 *
 * The achievement watcher writes each game's unlocks to its achievements
 * file. This service polls those files' modification times and, whenever one
 * changes, merges the game with its cloud copy both ways:
 *   - unlocks only the cloud has (another device, or a previous install) are
 *     written back locally — this is what restores a re-downloaded game, since
 *     its file only appears once the watcher picks the game up
 *   - unlocks only this device has are uploaded
 *
 * Design invariants:
 *   - Merging is a union: an achievement unlocked anywhere stays unlocked.
 *   - NEVER throw into the UI — sync is best-effort and silent.
 */

import {
  auth,
  getAllGameAchievements,
  syncGameAchievements,
} from "../firebase/firebaseService";

// Unlocks reach the cloud within this long of the watcher recording them
const POLL_INTERVAL_MS = 30 * 1000;

let activeUid = null;
let pollTimer = null;
let pollInFlight = false;
// Cloud copy of each game's achievements by lowercased name, loaded once per
// session and kept current with what this device uploads
let cloudDocs = null;
// Achievement file mtime last handled per game
const handledStamps = new Map();

const unlockedKeys = achievements =>
  new Set(
    (achievements || []).filter(a => a?.achieved).map(a => a.achID || a.message || a.name)
  );

/**
 * Write unlocks from a cloud achievement doc into a local game.
 * @returns {Promise<number>} how many achievements were newly unlocked
 */
export const restoreGameAchievementsFromCloud = async (gameName, isCustom, cloudData) => {
  const unlocks = (cloudData?.achievements || [])
    .filter(a => a?.achieved && a.achID)
    .map(a => ({ achID: a.achID, unlockTime: a.unlockTime || null }));
  if (unlocks.length === 0 || !window.electron?.mergeGameAchievements) return 0;
  const result = await window.electron.mergeGameAchievements(gameName, isCustom, unlocks);
  return result?.merged || 0;
};

const listGames = async () => {
  const [games, customGames] = await Promise.all([
    window.electron?.getGames?.() || [],
    window.electron?.getCustomGames?.() || [],
  ]);
  return [
    ...(games || [])
      .filter(g => !g.downloadingData?.downloading && !g.downloadingData?.extracting)
      .map(g => ({ name: g.game || g.name, isCustom: !!(g.isCustom || g.custom) })),
    ...(customGames || [])
      .filter(g => !g._isDeleted)
      .map(g => ({ name: g.game || g.name, isCustom: true })),
  ].filter(g => g.name);
};

const syncGame = async (uid, { name, isCustom }) => {
  let local = await window.electron.readGameAchievements(name, isCustom);
  if (!local?.achievements?.length) return;

  const cloud = cloudDocs.get(name.toLowerCase());
  if (await restoreGameAchievementsFromCloud(name, isCustom, cloud)) {
    local = await window.electron.readGameAchievements(name, isCustom);
  }

  const cloudUnlocked = unlockedKeys(cloud?.achievements);
  const hasNewUnlocks = [...unlockedKeys(local?.achievements)].some(
    key => !cloudUnlocked.has(key)
  );
  if (!hasNewUnlocks || activeUid !== uid || auth?.currentUser?.uid !== uid) return;

  const result = await syncGameAchievements(name, isCustom, local);
  if (result.success) cloudDocs.set(name.toLowerCase(), result.data);
};

const poll = async uid => {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    if (!cloudDocs) {
      const { data, error } = await getAllGameAchievements();
      if (error || !data) return; // Retried next poll
      cloudDocs = new Map(data.map(d => [String(d.gameName || d.id).toLowerCase(), d]));
    }

    const games = await listGames();
    const stamps = (await window.electron?.getAchievementStamps?.(games)) || {};
    for (const game of games) {
      if (activeUid !== uid) return;
      const stamp = stamps[game.name];
      if (!stamp || handledStamps.get(game.name) === stamp) continue;
      try {
        await syncGame(uid, game);
        handledStamps.set(game.name, stamp);
      } catch (e) {
        console.warn(
          `[achievementsCloudSync] Failed to sync ${game.name}:`,
          e?.message || e
        );
      }
    }
  } catch (e) {
    console.warn("[achievementsCloudSync] Sync failed:", e?.message || e);
  } finally {
    pollInFlight = false;
  }
};

/**
 * Start syncing achievements for the signed-in user.
 * @param {object} user - Firebase user
 * @param {boolean} hasAscendAccess - Cloud library sync requires Ascend access
 */
export const initializeAchievementsSync = (user, hasAscendAccess) => {
  stopAchievementsSync();
  if (!user?.uid || !hasAscendAccess) return;

  const uid = user.uid;
  activeUid = uid;
  pollTimer = setInterval(() => poll(uid), POLL_INTERVAL_MS);
  poll(uid);
};

/**
 * Stop syncing (sign-out / lost access). Local achievements are left untouched.
 */
export const stopAchievementsSync = () => {
  activeUid = null;
  cloudDocs = null;
  handledStamps.clear();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
};
