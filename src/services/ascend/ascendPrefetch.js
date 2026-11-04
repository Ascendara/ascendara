// Starts the Firestore reads the Ascend overview opens with when the pointer
// reaches its nav button, before the page itself mounts, so the page can be
// revealed with its data instead of fetching it afterwards. The page takes
// each result once for its first load; any later refresh fetches fresh.
import {
  auth,
  getCloudLibrary,
  verifyAscendAccess,
} from "@/services/firebase/firebaseService";

// A prefetch older than this is ignored and fetched again
const FRESH_MS = 60000;
// Don't start another prefetch while one this recent is still fresh enough
const REFETCH_AFTER_MS = 20000;

const prefetched = new Map(); // key -> { uid, at, promise, uses }

const loaders = {
  access: async () => {
    const hardwareId = (await window.electron?.getHardwareId?.()) ?? null;
    return verifyAscendAccess(hardwareId);
  },
  // Read by both the cloud library card and the merged play stats
  cloudLibrary: () => getCloudLibrary(),
};
const USES = { access: 1, cloudLibrary: 2 };

export function prefetchAscendData() {
  const uid = auth?.currentUser?.uid;
  if (!uid) return;
  const now = Date.now();
  for (const [key, load] of Object.entries(loaders)) {
    const entry = prefetched.get(key);
    if (entry?.uid === uid && now - entry.at < REFETCH_AFTER_MS) continue;
    const promise = load();
    promise.catch(() => {});
    prefetched.set(key, { uid, at: now, promise, uses: USES[key] });
  }
}

/** The prefetched result for `key` if there's a fresh one, else `fetcher()`. */
export function takePrefetched(key, uid, fetcher) {
  const entry = prefetched.get(key);
  if (!entry || entry.uid !== uid || Date.now() - entry.at > FRESH_MS) {
    return fetcher();
  }
  if (--entry.uses <= 0) prefetched.delete(key);
  return entry.promise;
}
