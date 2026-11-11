// Keeps the startup splash up until the first page has its data and images
// on screen, so the app is revealed finished instead of filling in (or
// refreshing with a newer index) right after the logo animation.
//
// Anything still loading for the first page takes a hold; the splash leaves
// once every hold is released and nothing new has started for a short while.
// Once boot is over, holds are no-ops so later navigation is unaffected.

import { usesOfficialIndex } from "@/lib/combinedSources";

// Quiet period after the last hold is released, so work kicked off by the
// render that released it (cards mounting, section effects) can take a hold.
const SETTLE_MS = 120;
// Never keep the splash up longer than this, however slow the network is.
const MAX_WAIT_MS = 10000;
// How long boot waits for the launch index sync before giving up on it. A sync
// that outlasts this lands after the app is showing and reloads every cover in
// front of the user, so wait for it to finish; this only bounds a stalled
// network (the request itself times out after 60s).
const INDEX_SYNC_WAIT_MS = 30000;

let pending = 0;
let armed = false;
let done = false;
let settleTimer = null;
let resolveReady = null;
const ready = new Promise(resolve => {
  resolveReady = resolve;
});
let bootIndexSync = null;

const finish = () => {
  if (done) return;
  done = true;
  clearTimeout(settleTimer);
  resolveReady();
};

const scheduleCheck = () => {
  clearTimeout(settleTimer);
  if (!armed || done || pending > 0) return;
  settleTimer = setTimeout(() => {
    // Two frames: let the last update commit and paint before revealing it.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (pending === 0) finish();
      })
    );
  }, SETTLE_MS);
};

/** Delay the end of boot until the returned release function is called. */
export function holdLoad() {
  if (done) return () => {};
  pending++;
  clearTimeout(settleTimer);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pending--;
    scheduleCheck();
  };
}

/** Release a hold once `url` has been fetched and decoded, so it paints immediately. */
export function releaseWhenDecoded(release, url) {
  if (!url || done) return release();
  const img = new Image();
  img.src = url;
  (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).finally(release);
}

/** Resolves once the first page is ready (or MAX_WAIT_MS has passed). */
export function whenBootReady() {
  if (!armed) {
    armed = true;
    setTimeout(finish, MAX_WAIT_MS);
    scheduleCheck();
  }
  return ready;
}

/** Resolves when boot is over, without asking it to finish. */
export const afterBoot = () => ready;

/**
 * Run the launch-time community index sync during boot so a newer index is in
 * place before Home loads, instead of swapping in under the user a few seconds
 * later. Waits at most INDEX_SYNC_WAIT_MS; a slower sync finishes in the
 * background and refreshes the UI the usual way.
 */
export function syncIndexDuringBoot(settings) {
  if (settings?.backgroundIndexSync === false || !usesOfficialIndex(settings)) {
    return Promise.resolve(null);
  }
  bootIndexSync = window.electron.syncCommunityIndex().catch(error => ({
    success: false,
    error: error?.message || String(error),
  }));
  return Promise.race([
    bootIndexSync,
    new Promise(resolve => setTimeout(() => resolve(null), INDEX_SYNC_WAIT_MS)),
  ]);
}

/** The boot-time sync, handed out once so the background refresher reuses it. */
export function takeBootIndexSync() {
  const sync = bootIndexSync;
  bootIndexSync = null;
  return sync;
}
