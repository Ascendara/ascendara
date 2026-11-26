import { updateUserStatus, getUserStatus, auth } from "../firebase/firebaseService";

const validStatuses = ["online", "away", "busy", "invisible"];
// The API turns online, away and busy into offline after ten minutes without a
// write, so those are refreshed well inside that. Offline and invisible never
// expire, so writing them again would change nothing.
const expiringStatuses = ["online", "away", "busy"];
export const PRESENCE_REFRESH_MS = 4 * 60_000;
let session = null;
let isPlayingGame = false;

const publish = async state => {
  if (session !== state || state.closing || auth.currentUser?.uid !== state.userId)
    return;
  const status = state.hidden && !isPlayingGame ? "offline" : state.preference;
  if (state.published === status && !expiringStatuses.includes(status)) {
    return { success: true, error: null };
  }
  const result = await updateUserStatus(status, undefined, true, false);
  if (result.success && session === state) {
    state.published = status;
    state.callback?.(status);
  }
  return result;
};

export const initializeStatusService = (onStatusChange, userId) => {
  if (!userId) return Promise.resolve();
  if (session?.userId === userId) return session.ready;
  cleanupStatusService();
  const state = {
    userId,
    callback: onStatusChange,
    preference: "online",
    hidden: false,
    closing: false,
    loaded: false,
    published: null,
    disposers: [],
    timer: null,
  };
  session = state;
  const refresh = async () => {
    if (session !== state || state.closing) return;
    if (!state.loaded) {
      const result = await getUserStatus(userId);
      if (session !== state || state.closing || result.error) return;
      state.preference = validStatuses.includes(result.data?.preferredStatus)
        ? result.data.preferredStatus
        : validStatuses.includes(result.data?.status)
          ? result.data.status
          : "online";
      state.loaded = true;
    }
    return publish(state);
  };
  const close = () => {
    if (session !== state) return;
    state.closing = true;
    clearInterval(state.timer);
    return updateUserStatus("offline", "", true, false);
  };
  const hidden = () => {
    state.hidden = true;
    if (state.loaded) void publish(state);
  };
  const shown = () => {
    state.hidden = false;
    void refresh();
  };
  if (typeof window !== "undefined") {
    if (window.electron?.onAppClose) {
      state.disposers.push(window.electron.onAppClose(close));
    } else {
      window.addEventListener("beforeunload", close);
      state.disposers.push(() => window.removeEventListener("beforeunload", close));
    }
    state.disposers.push(window.electron?.onAppHidden?.(hidden));
    state.disposers.push(window.electron?.onAppShown?.(shown));
    window.addEventListener("online", refresh);
    state.disposers.push(() => window.removeEventListener("online", refresh));
  }
  state.timer = setInterval(refresh, PRESENCE_REFRESH_MS);
  state.ready = refresh();
  return state.ready;
};

export const cleanupStatusService = () => {
  if (!session) return;
  clearInterval(session.timer);
  session.disposers.forEach(dispose => dispose?.());
  session = null;
};

export const setUserOnlineStatus = async (status, customMessage) => {
  const state = session;
  if (!state || state.closing || auth.currentUser?.uid !== state.userId) {
    return { success: false, error: "Not authenticated" };
  }
  if (!validStatuses.includes(status)) return { success: false, error: "Invalid status" };
  // Prevent a pending startup read from replacing this explicit choice.
  await state.ready;
  if (session !== state || state.closing)
    return { success: false, error: "Session ended" };
  const previous = state.preference;
  state.preference = status;
  state.loaded = true;
  const result = await updateUserStatus(status, customMessage, true, true);
  if (session === state) {
    if (!result.success && state.preference === status) state.preference = previous;
    if (result.success) {
      state.published = status;
      state.callback?.(status);
    }
  }
  return result;
};

export const getPreferredStatus = () => session?.preference || "online";

export const setGamePlayingState = playing => {
  isPlayingGame = playing;
  if (session?.loaded) void publish(session);
};
