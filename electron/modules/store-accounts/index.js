const path = require("node:path");
const crypto = require("node:crypto");
const { STORES, assertStore, createVault } = require("./vault");
const { LOGIN, ROOTS, allowedNavigation, steamIdentity, request, epicToken, syncLibrary, gameUrl } = require("./providers");

function createAccountManager({ vault, makeSession, authenticate, openExternal }) {
  const jobs = new Map();
  const errors = new Map();
  function state() {
    return { secureStorage: vault.available(), accounts: STORES.map(store => {
      let record;
      try { record = vault.read(store); } catch { errors.set(store, "Saved account could not be unlocked. Unlock your system keyring or disconnect and reconnect."); }
      return { store, connected: Boolean(record), displayName: record?.displayName || "",
        lastSync: record?.lastSync || null, busy: jobs.has(store), error: errors.get(store) || null,
        games: (record?.games || []).map(({ id, name }) => ({ id, name, store })) };
    }) };
  }
  async function run(store, connect) {
    assertStore(store);
    if (jobs.has(store)) throw new Error("An account operation is already running.");
    if (!vault.available()) throw new Error("Unlock your system keyring and restart Ascendara to connect accounts securely.");
    const controller = new AbortController();
    jobs.set(store, controller);
    errors.delete(store);
    let session;
    try {
      let record = connect ? null : vault.read(store);
      if (!connect && !record) throw new Error("Connect this store first.");
      session = await makeSession(store, record?.cookies || []);
      const credential = connect ? await authenticate(store, session, controller.signal) : record?.credential;
      if (controller.signal.aborted) throw new Error("Account operation cancelled.");
      const result = await syncLibrary(store, session, credential, controller.signal, async next => {
        if (controller.signal.aborted) throw new Error("Account operation cancelled.");
        if (record) { record = { ...record, credential: next }; vault.write(store, record); }
      });
      if (controller.signal.aborted) throw new Error("Account operation cancelled.");
      if (record && record.accountId !== result.accountId) throw new Error("The store account changed. Disconnect and reconnect to switch accounts.");
      const cookies = (await session.cookies.get({})).filter(cookie => {
        const host = cookie.domain.replace(/^\./, "");
        return cookie.secure && ROOTS[store].some(root => host === root || host.endsWith(`.${root}`));
      });
      if (controller.signal.aborted) throw new Error("Account operation cancelled.");
      vault.write(store, { accountId: result.accountId, displayName: result.displayName,
        games: [...new Map(result.games.map(item => [item.id, item])).values()],
        lastSync: new Date().toISOString(), cookies: store === "epic" ? [] : cookies,
        credential: result.credential || credential || null });
    } catch (error) {
      if (!controller.signal.aborted) errors.set(store, error.message);
      throw error;
    } finally {
      try { await session?.clearStorageData(); await session?.clearCache(); } catch { /* In-memory partition is discarded. */ }
      if (jobs.get(store) === controller) jobs.delete(store);
    }
    return state();
  }
  function disconnect(store) {
    assertStore(store);
    jobs.get(store)?.abort();
    vault.remove(store);
    errors.delete(store);
    return state();
  }
  async function openGame(store, id) {
    assertStore(store);
    const record = vault.read(store);
    if (typeof id !== "string" || !record?.games.some(game => game.id === id))
      throw new Error("This game is not in your connected library.");
    await openExternal(gameUrl(store, id));
  }
  return { state, connect: store => run(store, true), refresh: store => run(store, false), disconnect, openGame,
    cancel(store) { assertStore(store); jobs.get(store)?.abort(); },
    shutdown() { for (const controller of jobs.values()) controller.abort(); } };
}

function createAuthentication(BrowserWindow) {
  return (store, session, signal) => new Promise((resolve, reject) => {
    const win = new BrowserWindow({ width: 540, height: 760, show: false,
      title: `Connect ${store} — Ascendara`, autoHideMenuBar: true,
      webPreferences: { session, nodeIntegration: false, contextIsolation: true, sandbox: true,
        webSecurity: true, devTools: false, spellcheck: false } });
    let settled = false;
    let checking = false;
    const finish = (error, credential) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      if (!win.isDestroyed()) win.destroy();
      if (error) reject(error); else resolve(credential);
    };
    const cancel = () => finish(new Error("Sign-in cancelled."));
    const timeout = setTimeout(() => finish(new Error("Sign-in timed out. Please try again.")), 10 * 60 * 1000);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    win.on("closed", cancel);
    session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    session.on("will-download", event => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    const guard = (event, url) => { if (!allowedNavigation(store, url)) event.preventDefault(); };
    win.webContents.on("will-navigate", guard);
    win.webContents.on("will-redirect", guard);
    win.webContents.on("will-attach-webview", event => event.preventDefault());
    win.webContents.on("did-finish-load", async () => {
      if (checking || settled) return;
      checking = true;
      try {
        const url = new URL(win.webContents.getURL());
        if (!allowedNavigation(store, url.href)) return;
        if (store === "steam") {
          const identity = steamIdentity(await session.cookies.get({ url: "https://store.steampowered.com" }));
          if (identity) finish(null, null);
        } else if (store === "gog" && !url.pathname.includes("login") && !url.hostname.startsWith("auth.")) {
          const profile = await request(session.fetch.bind(session), "https://embed.gog.com/userData.json", {}, signal);
          if (profile.isLoggedIn && profile.galaxyUserId) finish(null, null);
        } else if (store === "epic" && url.origin === "https://www.epicgames.com" && url.pathname === "/id/api/redirect") {
          // Read only the fixed Epic response page in this isolated, preload-free window.
          const body = await win.webContents.executeJavaScript("document.body.innerText", false);
          if (typeof body !== "string" || body.length > 65536) throw new Error("Invalid sign-in response");
          const code = JSON.parse(body).authorizationCode;
          if (typeof code !== "string" || !/^[a-zA-Z0-9_-]{16,2048}$/.test(code)) throw new Error("Invalid sign-in response");
          finish(null, await epicToken(session.fetch.bind(session), { grant_type: "authorization_code", code }, signal));
        }
      } catch {
        // Pages visited before sign-in may return unauthenticated responses.
        // Keep the window open so the user can complete sign-in or retry.
      } finally { checking = false; }
    });
    win.once("ready-to-show", () => { if (!settled) win.show(); });
    win.loadURL(LOGIN[store]).catch(() => finish(new Error("Could not open store sign-in. Check your connection.")));
  });
}

function registerStoreAccountHandlers() {
  const { app, ipcMain, session, safeStorage, BrowserWindow, shell } = require("electron");
  const vault = createVault(path.join(app.getPath("userData"), "store-accounts"), safeStorage);
  const storeGames = require("./games").createStoreGames({
    vault, directory: path.join(app.getPath("userData"), "store-artwork", "games"),
    discover: require("../launcher-discovery").discoverLauncherGames,
    downloadAssets: require("../launcher-import").downloadImportedAssets,
    shell,
  });
  const manager = createAccountManager({ vault, authenticate: createAuthentication(BrowserWindow),
    openExternal: url => shell.openExternal(url),
    async makeSession(store, cookies) {
      const isolated = session.fromPartition(`store-${store}-${crypto.randomUUID()}`, { cache: false });
      for (const cookie of cookies) {
        const host = String(cookie.domain || "").replace(/^\./, "");
        if (!cookie.secure || !ROOTS[store].some(root => host === root || host.endsWith(`.${root}`))) continue;
        if (cookie.expirationDate && cookie.expirationDate <= Date.now() / 1000) continue;
        const { name, value, domain, path: cookiePath, secure, httpOnly, sameSite, expirationDate } = cookie;
        await isolated.cookies.set({ url: `https://${host}${cookiePath || "/"}`, name, value,
          ...(cookie.hostOnly ? {} : { domain }), path: cookiePath || "/", secure, httpOnly, sameSite,
          ...(expirationDate ? { expirationDate } : {}) });
      }
      return isolated;
    } });
  const handle = (channel, action) => ipcMain.handle(channel, async (_event, ...args) => {
    try { return { success: true, data: await action(...args) }; }
    catch (error) { return { success: false, error: error.message }; }
  });
  handle("store-accounts-state", manager.state);
  handle("store-accounts-connect", manager.connect);
  handle("store-accounts-refresh", manager.refresh);
  handle("store-accounts-disconnect", manager.disconnect);
  handle("store-accounts-cancel", manager.cancel);
  handle("store-accounts-open-game", storeGames.open);
  handle("store-game-details", storeGames.details);
  handle("store-game-artwork", storeGames.artwork);
  app.on("before-quit", manager.shutdown);
}
module.exports = { createAccountManager, createAuthentication, registerStoreAccountHandlers };
