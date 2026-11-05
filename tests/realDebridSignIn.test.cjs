const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = async () => {
  const signIn = await loadModule("src/services/downloads/realDebridSignIn.js", {
    fresh: true,
  });
  return signIn;
};

const withGlobals = t => {
  const saved = { fetch: global.fetch, window: global.window };
  t.after(() => Object.assign(global, saved));
};

const signedInSettings = () => ({
  realDebridApiKey: "old-token",
  realDebridOauthClientId: "client",
  realDebridOauthClientSecret: "secret",
  realDebridOauthRefreshToken: "refresh",
});

test("the code sign-in follows the docs from code to tokens", async t => {
  withGlobals(t);
  const requests = [];
  let approved = false;
  global.fetch = async (url, options = {}) => {
    requests.push({
      url,
      method: options.method ?? "GET",
      body: String(options.body ?? ""),
    });
    if (url.includes("/device/code"))
      return Response.json({
        device_code: "device",
        user_code: "ABC123",
        interval: 1,
        expires_in: 600,
        direct_verification_url: "https://real-debrid.com/device?code=ABC123",
      });
    if (url.includes("/device/credentials"))
      return approved
        ? Response.json({ client_id: "client", client_secret: "secret" })
        : Response.json({ error: null }, { status: 403 });
    return Response.json({ access_token: "access", refresh_token: "refresh" });
  };
  const { startCodeSignIn, pollCodeSignIn } = await load();

  const flow = await startCodeSignIn();
  assert.equal(flow.userCode, "ABC123");
  assert.equal(flow.intervalMs, 5000, "never faster than every 5 seconds");
  assert.equal(flow.openUrl, "https://real-debrid.com/device?code=ABC123");
  assert.ok(requests[0].url.startsWith("/api/rdoauth/device/code?client_id="));
  assert.ok(requests[0].url.endsWith("&new_credentials=yes"));

  assert.deepEqual(await pollCodeSignIn(flow), { status: "pending" });
  approved = true;
  assert.deepEqual(await pollCodeSignIn(flow), {
    status: "approved",
    settings: {
      realDebridApiKey: "access",
      realDebridOauthClientId: "client",
      realDebridOauthClientSecret: "secret",
      realDebridOauthRefreshToken: "refresh",
    },
  });
  const token = requests.at(-1);
  assert.equal(token.url, "/api/rdoauth/token");
  assert.equal(token.method, "POST");
  const form = new URLSearchParams(token.body);
  assert.equal(form.get("code"), "device");
  assert.equal(form.get("grant_type"), "http://oauth.net/grant_type/device/1.0");
});

test("a sign-in page from a server answer must be Real-Debrid's own", async t => {
  withGlobals(t);
  const { startCodeSignIn, VERIFICATION_URL } = await load();
  for (const page of [
    "javascript:alert(1)",
    "http://real-debrid.com/x",
    "https://evil.test/",
  ]) {
    global.fetch = async () =>
      Response.json({ device_code: "d", user_code: "u", direct_verification_url: page });
    assert.equal((await startCodeSignIn()).openUrl, VERIFICATION_URL);
  }
});

test("a sign-in keeps waiting through a busy API and stops on a refusal", async t => {
  withGlobals(t);
  const { pollCodeSignIn } = await load();
  const flow = { deviceCode: "d" };
  for (const status of [429, 503]) {
    global.fetch = async () => Response.json({}, { status });
    assert.deepEqual(await pollCodeSignIn(flow), { status: "pending" });
  }
  global.fetch = async () => {
    throw new Error("offline");
  };
  assert.deepEqual(await pollCodeSignIn(flow), { status: "pending" });
  global.fetch = async () => Response.json({ error: "access_denied" }, { status: 403 });
  assert.deepEqual(await pollCodeSignIn(flow), { status: "failed" });
});

test("a rejected token is renewed once, saved, and the request goes through", async t => {
  withGlobals(t);
  const saved = [];
  let settings = signedInSettings();
  global.window = {
    electron: {
      getSettings: async () => settings,
      saveSettings: async values => {
        saved.push(values);
        settings = { ...settings, ...values };
        return true;
      },
    },
  };
  const calls = { token: 0, api: [] };
  global.fetch = async (url, options) => {
    if (url === "/api/rdoauth/token") {
      calls.token += 1;
      assert.equal(new URLSearchParams(options.body).get("code"), "refresh");
      await new Promise(resolve => setTimeout(resolve, 5));
      return Response.json({ access_token: "new-token", refresh_token: "new-refresh" });
    }
    const auth = options.headers.Authorization;
    calls.api.push(auth);
    return auth === "Bearer new-token"
      ? Response.json({ username: "user" })
      : Response.json({ error: "bad_token", error_code: 8 }, { status: 401 });
  };
  const rd = await loadModule("src/services/downloads/realDebridService.js", {
    fresh: true,
  });

  const results = await Promise.all([
    rd.getUserInfo("old-token"),
    rd.getUserInfo("old-token"),
    rd.getUserInfo("old-token"),
  ]);
  assert.deepEqual(results[2], { username: "user" });
  assert.equal(calls.token, 1, "requests at the same time share one refresh");
  assert.deepEqual(saved, [
    { realDebridApiKey: "new-token", realDebridOauthRefreshToken: "new-refresh" },
  ]);

  // A later request from a loop that still holds the old token.
  assert.deepEqual(await rd.getUserInfo("old-token"), { username: "user" });
  assert.equal(calls.token, 1);
});

test("a key that is not the saved login is never renewed", async t => {
  withGlobals(t);
  let tokenCalls = 0;
  global.window = { electron: { getSettings: async () => signedInSettings() } };
  global.fetch = async url => {
    if (url === "/api/rdoauth/token") tokenCalls += 1;
    return Response.json({ error: "bad_token", error_code: 8 }, { status: 401 });
  };
  const rd = await loadModule("src/services/downloads/realDebridService.js", {
    fresh: true,
  });
  await assert.rejects(rd.getUserInfo("pasted-key"), /invalid or expired/);
  assert.equal(tokenCalls, 0);
});

test("a pasted key without a sign-in and a revoked login report the bad key", async t => {
  withGlobals(t);
  for (const settings of [
    { realDebridApiKey: "key" },
    { ...signedInSettings(), realDebridApiKey: "key" },
  ]) {
    let apiCalls = 0;
    global.window = { electron: { getSettings: async () => settings } };
    global.fetch = async url => {
      if (url !== "/api/rdoauth/token") apiCalls += 1;
      return Response.json({ error: "bad_token", error_code: 8 }, { status: 401 });
    };
    const rd = await loadModule("src/services/downloads/realDebridService.js", {
      fresh: true,
    });
    await assert.rejects(rd.getUserInfo("key"), /invalid or expired/);
    assert.equal(apiCalls, 1, "no retry without a new token");
  }
});
