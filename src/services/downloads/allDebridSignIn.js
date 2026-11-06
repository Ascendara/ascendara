// AllDebrid's PIN sign-in, as its API docs describe it. It needs no registered app:
// the approved PIN hands back an API key for this account.
const API_BASE_URL = "/api/alldebrid";
export const VERIFICATION_URL = "https://alldebrid.com/pin/";
// The docs' example checks every 5 seconds; the answer carries no interval.
const POLL_MS = 5000;

// A pasted key or a removed login is not a code sign-in.
export const CLEARED_SIGN_IN = { allDebridSignedIn: false };

async function call(path, form) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...(form
      ? {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(form),
        }
      : {}),
    signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function officialPage(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname === "alldebrid.com" ? url : null;
  } catch {
    return null;
  }
}

export async function startCodeSignIn() {
  const { body } = await call("/v4.1/pin/get");
  const data = body?.status === "success" ? body.data : null;
  if (!data?.pin || !data?.check)
    throw new Error("AllDebrid could not start the sign-in.");
  return {
    pin: data.pin,
    check: data.check,
    userCode: data.pin,
    openUrl: officialPage(data.user_url) ?? VERIFICATION_URL,
    intervalMs: POLL_MS,
    expiresAt: Date.now() + (data.expires_in || 600) * 1000,
  };
}

/**
 * One check on a started sign-in: { status: "pending" }, { status: "failed" }, or
 * { status: "approved", settings } with what to save.
 */
export async function pollCodeSignIn(flow) {
  try {
    const { status, body } = await call("/v4/pin/check", {
      pin: flow.pin,
      check: flow.check,
    });
    if (status === 429 || status >= 500) return { status: "pending" };
    if (body?.status !== "success") return { status: "failed" };
    if (!body.data?.activated) return { status: "pending" };
    if (!body.data.apikey) return { status: "failed" };
    return {
      status: "approved",
      settings: { allDebridApiKey: body.data.apikey, allDebridSignedIn: true },
    };
  } catch {
    return { status: "pending" };
  }
}
