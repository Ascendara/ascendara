const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./helpers/loadModule.cjs");

const load = () =>
  loadModule("src/services/downloads/allDebridSignIn.js", { fresh: true });

function stubFetch(t, handler) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const body = options.body ? new URLSearchParams(options.body) : null;
    calls.push({ url: String(url), options, body });
    return handler(String(url), body);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });
  return calls;
}

test("AllDebrid PIN sign-in starts without a key and opens AllDebrid's own page", async t => {
  const calls = stubFetch(t, () =>
    Response.json({
      status: "success",
      data: {
        pin: "ABCD",
        check: "secret-check",
        expires_in: 600,
        user_url: "https://alldebrid.com/pin/?pin=ABCD",
      },
    })
  );
  const signIn = await load();
  const flow = await signIn.startCodeSignIn();
  assert.equal(calls[0].url, "/api/alldebrid/v4.1/pin/get");
  assert.equal(calls[0].options.headers, undefined, "no key is sent");
  assert.equal(flow.userCode, "ABCD");
  assert.equal(flow.openUrl, "https://alldebrid.com/pin/?pin=ABCD");
  assert.equal(flow.intervalMs, 5000);
  assert.ok(flow.expiresAt > Date.now());
});

test("an AllDebrid sign-in page from the answer must be AllDebrid's own", async t => {
  const signIn = await load();
  for (const url of [
    "http://alldebrid.com/pin/",
    "https://alldebrid.com.evil/pin",
    "x",
  ]) {
    stubFetch(t, () =>
      Response.json({ status: "success", data: { pin: "A", check: "c", user_url: url } })
    );
    assert.equal((await signIn.startCodeSignIn()).openUrl, signIn.VERIFICATION_URL);
  }
  stubFetch(t, () => Response.json({ status: "error", error: { code: "X" } }));
  await assert.rejects(signIn.startCodeSignIn(), /could not start/);
});

test("AllDebrid PIN checks map to pending, approved and failed", async t => {
  const signIn = await load();
  const flow = { pin: "ABCD", check: "secret-check" };
  const answer = response => stubFetch(t, () => response);

  const calls = answer(Response.json({ status: "success", data: { activated: false } }));
  assert.deepEqual(await signIn.pollCodeSignIn(flow), { status: "pending" });
  assert.equal(calls[0].url, "/api/alldebrid/v4/pin/check");
  assert.equal(calls[0].body.get("pin"), "ABCD");
  assert.equal(calls[0].body.get("check"), "secret-check");

  answer(
    Response.json({ status: "success", data: { activated: true, apikey: "new-key" } })
  );
  assert.deepEqual(await signIn.pollCodeSignIn(flow), {
    status: "approved",
    settings: { allDebridApiKey: "new-key", allDebridSignedIn: true },
  });

  answer(Response.json({ status: "error", error: { code: "PIN_EXPIRED" } }));
  assert.deepEqual(await signIn.pollCodeSignIn(flow), { status: "failed" });
  answer(new Response("busy", { status: 429 }));
  assert.deepEqual(await signIn.pollCodeSignIn(flow), { status: "pending" });
  stubFetch(t, () => {
    throw new Error("offline");
  });
  assert.deepEqual(await signIn.pollCodeSignIn(flow), { status: "pending" });
});

test("the AllDebrid provider exposes the sign-in like Real-Debrid does", async () => {
  const provider = (
    await loadModule("src/services/downloads/debrid/allDebridProvider.js", {
      fresh: true,
    })
  ).default;
  assert.equal(typeof provider.signIn.start, "function");
  assert.equal(typeof provider.signIn.poll, "function");
  assert.deepEqual(provider.signIn.clearedSettings, { allDebridSignedIn: false });
  assert.equal(provider.signIn.isSignedIn({ allDebridSignedIn: true }), true);
  assert.equal(provider.signIn.isSignedIn({ allDebridApiKey: "pasted" }), false);
  assert.equal(provider.signIn.signedInText, "debrid.signIn.signedInKey");
});
