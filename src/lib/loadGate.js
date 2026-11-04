// Holds a screen back until what it's loading is on screen, so it's revealed
// finished instead of filling in (or stuttering) after it appears. Used for
// the startup splash and for every page change.
//
// While a load is open, anything still fetching data or images takes a hold;
// the load completes once every hold is released and nothing new has started
// for a moment. Outside of a load, holds are no-ops. A page that has nothing
// to load is revealed straight away.

// Quiet period after the last hold is released, so work kicked off by the
// render that released it (cards mounting, chained effects) can take a hold.
// Boot can afford to be patient; page changes should feel instant.
const BOOT_SETTLE = { ms: 120, frames: 2 };
const PAGE_SETTLE = { ms: 0, frames: 1 };
// Never wait longer than this, however slow the network is.
const BOOT_MAX_WAIT_MS = 10000;
const PAGE_MAX_WAIT_MS = 2000;
// How long boot waits for the background index sync before giving up on it.
const INDEX_SYNC_WAIT_MS = 6000;

const createLoad = (settle, maxWaitMs) => {
  const load = { pending: 0, armed: false, done: false, settle, maxWaitMs };
  load.promise = new Promise(resolve => {
    load.resolve = resolve;
  });
  return load;
};

const finish = load => {
  if (load.done) return;
  load.done = true;
  clearTimeout(load.settleTimer);
  clearTimeout(load.maxTimer);
  load.resolve();
};

const scheduleCheck = load => {
  clearTimeout(load.settleTimer);
  if (!load.armed || load.done || load.pending > 0) return;
  load.settleTimer = setTimeout(() => {
    // Let the last update commit (and, for boot, paint) before revealing it
    const afterFrames = frames => {
      if (frames === 0) {
        if (load.pending === 0) finish(load);
        return;
      }
      requestAnimationFrame(() => afterFrames(frames - 1));
    };
    afterFrames(load.settle.frames);
  }, load.settle.ms);
};

const arm = load => {
  if (load.armed) return;
  load.armed = true;
  load.maxTimer = setTimeout(() => finish(load), load.maxWaitMs);
  scheduleCheck(load);
};

// Boot is open from the start: the first page mounts before the splash asks.
const bootLoad = createLoad(BOOT_SETTLE, BOOT_MAX_WAIT_MS);
let current = bootLoad;
let bootIndexSync = null;

/** Delay the current load until the returned release function is called. */
export function holdLoad() {
  const load = current;
  if (load.done) return () => {};
  load.pending++;
  clearTimeout(load.settleTimer);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    load.pending--;
    scheduleCheck(load);
  };
}

/** Release a hold once `url` has been fetched and decoded, so it paints immediately. */
export function releaseWhenDecoded(release, url) {
  if (!url || current.done) return release();
  const img = new Image();
  img.src = url;
  (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).finally(release);
}

/** Resolves once the first page is ready (or BOOT_MAX_WAIT_MS has passed). */
export function whenBootReady() {
  arm(bootLoad);
  return bootLoad.promise;
}

/** Resolves when boot is over, without asking it to finish. */
export const afterBoot = () => bootLoad.promise;

/**
 * Open a load for a page that just mounted: call from a layout effect, before
 * its effects run, so the holds they take count. Supersedes any earlier one.
 */
export function beginPageLoad() {
  if (!bootLoad.done) return;
  finish(current);
  current = createLoad(PAGE_SETTLE, PAGE_MAX_WAIT_MS);
}

/**
 * Call once the page's own effects have run (a parent's passive effect).
 * Resolves right away if they started nothing, otherwise once it has all
 * finished, or PAGE_MAX_WAIT_MS has passed.
 */
export function whenPageLoaded() {
  if (!bootLoad.done) return bootLoad.promise;
  const load = current;
  if (load.pending === 0) finish(load);
  else arm(load);
  return load.promise;
}

/** Stop waiting on a page load from whenPageLoaded (it was cancelled). */
export function endPageLoad(promise) {
  if (current !== bootLoad && current.promise === promise) finish(current);
}

/** True while a new page is loading behind the one on screen. */
export const isPageLoading = () => current !== bootLoad && !current.done;

/**
 * Run the launch-time community index sync during boot so a newer index is in
 * place before Home loads, instead of swapping in under the user a few seconds
 * later. Waits at most INDEX_SYNC_WAIT_MS; a slower sync finishes in the
 * background and refreshes the UI the usual way.
 */
export function syncIndexDuringBoot(settings) {
  if (settings?.backgroundIndexSync === false || settings?.customSourcesMode) {
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
