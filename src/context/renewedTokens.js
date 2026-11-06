// Real-Debrid renews these in the background. A settings snapshot taken before a
// renewal still holds the old values and must not write them back.
const RENEWED_KEYS = ["realDebridApiKey", "realDebridOauthRefreshToken"];

/** Notes the values an update from the main process replaced. */
export function noteRenewedTokens(replaced, current, incoming) {
  for (const key of RENEWED_KEYS) {
    if (!incoming || !(key in incoming)) continue;
    if (current[key] && incoming[key] !== current[key]) replaced[key] = current[key];
  }
}

/** The next settings, keeping renewed values a stale snapshot would undo. */
export function keepRenewedTokens(next, current, replaced) {
  let kept = next;
  for (const key of RENEWED_KEYS) {
    if (!(key in replaced) || Object.is(next[key], current[key])) continue;
    if (Object.is(next[key], replaced[key])) {
      if (kept === next) kept = { ...next };
      kept[key] = current[key];
    } else {
      // A new sign-in or sign-out: the old value may be used again.
      delete replaced[key];
    }
  }
  return kept;
}
