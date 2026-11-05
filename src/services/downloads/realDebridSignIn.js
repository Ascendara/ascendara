// Real-Debrid's device sign-in for open source apps, as its API docs describe it.
const OAUTH_BASE_URL = "/api/rdoauth";
// The client id the docs give open source apps. It only starts the flow:
// new_credentials=yes then yields a client id and secret bound to the user.
const OPEN_SOURCE_CLIENT_ID = "X245A4XAIBGVM";
const DEVICE_GRANT = "http://oauth.net/grant_type/device/1.0";
export const VERIFICATION_URL = "https://real-debrid.com/device";

// A pasted key or a removed login leaves these empty.
export const CLEARED_SIGN_IN = {
  realDebridOauthClientId: "",
  realDebridOauthClientSecret: "",
  realDebridOauthRefreshToken: "",
};

async function call(path, options) {
  const response = await fetch(`${OAUTH_BASE_URL}${path}`, {
    ...options,
    signal: AbortSignal.timeout(30000),
  });
  return {
    status: response.status,
    ok: response.ok,
    body: await response.json().catch(() => null),
  };
}

// Both the first token and a refresh are this same call, per the docs.
const postToken = (clientId, clientSecret, code) =>
  call("/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: DEVICE_GRANT,
    }),
  });

function officialPage(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname === "real-debrid.com" ? url : null;
  } catch {
    return null;
  }
}

export async function startCodeSignIn() {
  const { ok, body } = await call(
    `/device/code?client_id=${OPEN_SOURCE_CLIENT_ID}&new_credentials=yes`
  );
  if (!ok || !body?.device_code || !body?.user_code)
    throw new Error("Real-Debrid could not start the sign-in.");
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    openUrl: officialPage(body.direct_verification_url) ?? VERIFICATION_URL,
    intervalMs: Math.max(body.interval || 5, 5) * 1000,
    expiresAt: Date.now() + (body.expires_in || 600) * 1000,
  };
}

const canTryAgain = status => status === 429 || status >= 500;

/**
 * One check on a started sign-in: { status: "pending" }, { status: "failed" }, or
 * { status: "approved", settings } with what to save.
 */
export async function pollCodeSignIn(flow) {
  try {
    if (!flow.clientId) {
      const { status, ok, body } = await call(
        `/device/credentials?client_id=${OPEN_SOURCE_CLIENT_ID}&code=${encodeURIComponent(flow.deviceCode)}`
      );
      // Not approved yet is a 403 without an error.
      if ((status === 403 && !body?.error) || canTryAgain(status)) {
        return { status: "pending" };
      }
      if (!ok || !body?.client_id || !body?.client_secret) return { status: "failed" };
      // Kept in the flow: a failed token call retries without asking for these again.
      flow.clientId = body.client_id;
      flow.clientSecret = body.client_secret;
    }
    const { status, ok, body } = await postToken(
      flow.clientId,
      flow.clientSecret,
      flow.deviceCode
    );
    if (canTryAgain(status)) return { status: "pending" };
    if (!ok || !body?.access_token || !body?.refresh_token) return { status: "failed" };
    return {
      status: "approved",
      settings: {
        realDebridApiKey: body.access_token,
        realDebridOauthClientId: flow.clientId,
        realDebridOauthClientSecret: flow.clientSecret,
        realDebridOauthRefreshToken: body.refresh_token,
      },
    };
  } catch {
    return { status: "pending" };
  }
}

let refreshing = null;
let refreshedFrom = null;

async function refresh(rejectedToken) {
  const settings = await globalThis.window?.electron?.getSettings?.();
  const current = settings?.realDebridApiKey?.trim();
  // A request that left just before the last refresh finished.
  if (rejectedToken === refreshedFrom) return current || null;
  const clientId = settings?.realDebridOauthClientId;
  const clientSecret = settings?.realDebridOauthClientSecret;
  const refreshToken = settings?.realDebridOauthRefreshToken;
  // A pasted key, or a key being tested before it is saved, has nothing to renew.
  if (current !== rejectedToken || !clientId || !clientSecret || !refreshToken)
    return null;

  const { ok, body } = await postToken(clientId, clientSecret, refreshToken);
  if (!ok || !body?.access_token) return null;
  await window.electron.saveSettings({
    realDebridApiKey: body.access_token,
    realDebridOauthRefreshToken: body.refresh_token || refreshToken,
  });
  refreshedFrom = rejectedToken;
  return body.access_token;
}

/** A new token for one the API rejected, or null when it can not be renewed. */
export function refreshSignIn(rejectedToken) {
  if (refreshing?.from === rejectedToken) return refreshing.task;
  const task = refresh(rejectedToken)
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  refreshing = { from: rejectedToken, task };
  return task;
}
