const EPIC_CLIENT = "34a02cf8f4414e29b15921876da36f9a";
// Public native-launcher client identifier; this is not a user credential.
const EPIC_BASIC = Buffer.from(
  `${EPIC_CLIENT}:daafbccc737745039dffe53d94fc76cf`
).toString("base64");
const EPIC_AUTH =
  "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth";
const API_HOSTS = new Set([
  "api.steampowered.com",
  "store.steampowered.com",
  "steamcommunity.com",
  "embed.gog.com",
  "www.gog.com",
  "account-public-service-prod03.ol.epicgames.com",
  "library-service.live.use1a.on.epicgames.com",
  "catalog-public-service-prod06.ol.epicgames.com",
]);
const LOGIN = {
  steam: "https://store.steampowered.com/login/?redir=account%2F",
  gog: "https://auth.gog.com/auth?client_id=46899977096215655&layout=client2&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code",
  epic: `https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(`https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT}&responseType=code`)}`,
};
const ROOTS = {
  steam: ["steampowered.com", "steamcommunity.com", "steamstatic.com"],
  gog: ["gog.com", "gog-statics.com"],
  epic: ["epicgames.com", "hcaptcha.com", "arkoselabs.com"],
};
function allowedNavigation(store, raw) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ROOTS[store]?.some(
        root => url.hostname === root || url.hostname.endsWith(`.${root}`)
      )
    );
  } catch {
    return false;
  }
}
function safeId(value) {
  const id = String(value ?? "");
  if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_.:-]{0,599}$/.test(id))
    throw new Error("Invalid store game identifier");
  return id;
}
function game(store, id, name) {
  return { store, id: safeId(id), name: String(name || id).slice(0, 300) };
}
function steamIdentity(cookies) {
  for (const cookie of cookies) {
    if (
      cookie.name !== "steamLoginSecure" ||
      !cookie.secure ||
      !["store.steampowered.com", ".steampowered.com"].includes(cookie.domain)
    )
      continue;
    let parts;
    try {
      parts = decodeURIComponent(cookie.value).split("||");
    } catch {
      continue;
    }
    if (/^7656119\d{10}$/.test(parts[0]) && parts[1]?.length > 20)
      return { id: parts[0], token: parts[1] };
  }
  return null;
}

// Bounded response bodies and no redirects prevent credentials following a redirect
// to another origin. Errors never include URLs, response bodies, cookies or tokens.
async function request(fetcher, raw, options = {}, signal) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !API_HOSTS.has(url.hostname)
  )
    throw new Error("Invalid store endpoint");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 30000);
  try {
    const response = await fetcher(url.href, {
      ...options,
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "Your store session expired or access was denied. Reconnect your account."
      );
    if (response.status === 429)
      throw new Error("The store is limiting requests. Try again later.");
    if (!response.ok)
      throw new Error("The store could not complete the request. Try again later.");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 12 * 1024 * 1024) throw new Error("The store response was too large.");
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error(
        "The store returned an unexpected response. Reconnect your account."
      );
    }
  } catch (error) {
    if (error.message?.startsWith("The store") || error.message?.startsWith("Your store"))
      throw error;
    throw new Error(
      signal?.aborted
        ? "Account operation cancelled."
        : "Could not reach the store. Check your connection and try again."
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function epicToken(fetcher, credentials, signal) {
  const data = await request(
    fetcher,
    `${EPIC_AUTH}/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${EPIC_BASIC}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ ...credentials, token_type: "eg1" }).toString(),
    },
    signal
  );
  if (
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string" ||
    !data.account_id
  )
    throw new Error("Epic sign-in could not be completed. Please try again.");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accountId: safeId(data.account_id),
    displayName: String(data.displayName || "Epic account").slice(0, 100),
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in) || 0) * 1000,
  };
}

async function steamNames(json, ids) {
  const names = new Map();
  for (let start = 0; start < ids.length; start += 100) {
    const input = {
      ids: ids.slice(start, start + 100).map(id => ({ appid: Number(id) })),
      context: { language: "english", country_code: "US" },
      data_request: {},
    };
    const data = await json(
      `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?${new URLSearchParams({ input_json: JSON.stringify(input) })}`
    );
    for (const item of data.response?.store_items || [])
      if (item.appid && item.name)
        names.set(String(item.appid), String(item.name).slice(0, 300));
  }
  return names;
}

// The store lookup refuses apps without a storefront page (tools, hidden or
// unreleased apps); the community app list still has their names.
async function steamCommunityNames(json, ids) {
  const names = new Map();
  for (let start = 0; start < ids.length; start += 100) {
    const params = new URLSearchParams();
    ids
      .slice(start, start + 100)
      .forEach((id, index) => params.set(`appids[${index}]`, id));
    const data = await json(
      `https://api.steampowered.com/ICommunityService/GetApps/v1/?${params}`
    );
    for (const item of data.response?.apps || [])
      if (item.appid && item.name)
        names.set(String(item.appid), String(item.name).slice(0, 300));
  }
  return names;
}

// Steam reports "appid_<id>" instead of a title for some owned apps (often
// delisted or recently changed ones), so look those names up separately.
async function steamOwnedNames(json, games) {
  const missing = games
    .filter(item => !item.name || /^(appid_)?\d+$/i.test(item.name))
    .map(item => String(item.appid));
  if (!missing.length) return games;
  const names = new Map();
  for (const lookup of [steamNames, steamCommunityNames]) {
    const ids = missing.filter(id => !names.has(id));
    if (!ids.length) break;
    try {
      for (const [id, name] of await lookup(json, ids)) names.set(id, name);
    } catch (error) {
      if (error.message === "Account operation cancelled.") throw error;
    }
  }
  return games.map(item => {
    const name = names.get(String(item.appid));
    return name ? { ...item, name } : item;
  });
}

// The wishlist only carries app ids, so names come from the store's item lookup.
// It is best-effort: a private or failed wishlist returns null and the caller
// keeps the last one it saw, so library syncs never fail because of it.
async function steamWishlist(json, identity) {
  try {
    const params = new URLSearchParams({
      access_token: identity.token,
      steamid: identity.id,
    });
    const items = (
      await json(
        `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?${params}`
      )
    ).response?.items;
    if (!Array.isArray(items)) return null;
    const wishlist = items
      .slice(0, 5000)
      .map(item => ({
        id: safeId(item.appid),
        addedAt:
          Number(item.date_added) > 0
            ? new Date(item.date_added * 1000).toISOString()
            : null,
      }));
    const names = await steamNames(
      json,
      wishlist.map(item => item.id)
    );
    return wishlist
      .filter(item => names.has(item.id))
      .map(item => ({ ...item, name: names.get(item.id) }));
  } catch (error) {
    if (error.message === "Account operation cancelled.") throw error;
    return null;
  }
}

async function syncLibrary(
  store,
  session,
  credential,
  signal,
  saveCredential = () => {}
) {
  const fetcher = session.fetch.bind(session);
  const json = (url, options) => request(fetcher, url, options, signal);
  if (store === "steam") {
    const identity = steamIdentity(
      await session.cookies.get({ url: "https://store.steampowered.com" })
    );
    if (!identity) throw new Error("Your Steam session expired. Reconnect your account.");
    const params = new URLSearchParams({
      access_token: identity.token,
      steamid: identity.id,
      include_appinfo: "1",
      include_played_free_games: "1",
      skip_unvetted_apps: "0",
    });
    const data = (
      await json(
        `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?${params}`
      )
    ).response;
    if (!data || (!Array.isArray(data.games) && data.game_count !== 0))
      throw new Error(
        "Steam did not return your library. Reconnect and check your game-details privacy settings."
      );
    return {
      accountId: identity.id,
      displayName: `Steam ${identity.id}`,
      games: (await steamOwnedNames(json, data.games || [])).map(item =>
        game(store, item.appid, item.name)
      ),
      wishlist: await steamWishlist(json, identity),
    };
  }
  if (store === "gog") {
    const profile = await json("https://embed.gog.com/userData.json");
    if (!profile.isLoggedIn || !profile.galaxyUserId)
      throw new Error("Your GOG session expired. Reconnect your account.");
    const games = [];
    for (let page = 1; page <= 200; page++) {
      const data = await json(
        `https://embed.gog.com/account/getFilteredProducts?mediaType=1&page=${page}`
      );
      if (
        !Array.isArray(data.products) ||
        !Number.isInteger(data.totalPages) ||
        data.totalPages > 200
      )
        throw new Error("GOG returned an unexpected library response.");
      games.push(...data.products.map(item => game(store, item.id, item.title)));
      if (page >= data.totalPages) break;
    }
    return {
      accountId: String(profile.galaxyUserId),
      displayName: String(profile.username || "GOG account").slice(0, 100),
      games,
    };
  }
  if (store !== "epic") throw new Error("Unsupported store");
  let token = credential;
  if (!token?.refreshToken) throw new Error("Reconnect your Epic account.");
  if (token.expiresAt < Date.now() + 120000) {
    token = await epicToken(
      fetcher,
      { grant_type: "refresh_token", refresh_token: token.refreshToken },
      signal
    );
    // Persist rotated refresh tokens even if a later library request fails.
    await saveCredential(token);
  }
  const headers = { Authorization: `Bearer ${token.accessToken}` };
  const games = [];
  const cursors = new Set();
  let cursor = "";
  for (let page = 0; page < 200; page++) {
    const params = new URLSearchParams({ includeMetadata: "true" });
    if (cursor) params.set("cursor", cursor);
    const data = await json(
      `https://library-service.live.use1a.on.epicgames.com/library/api/public/items?${params}`,
      { headers }
    );
    if (!Array.isArray(data.records))
      throw new Error("Epic returned an unexpected library response.");
    for (const item of data.records) {
      if (!item.appName || item.namespace === "ue" || item.sandboxType === "PRIVATE")
        continue;
      const namespace = safeId(item.namespace);
      const catalogId = safeId(item.catalogItemId);
      const metadata = await json(
        `https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${encodeURIComponent(namespace)}/bulk/items?id=${encodeURIComponent(catalogId)}&includeDLCDetails=true&includeMainGameDetails=true`,
        { headers }
      );
      const info = metadata[catalogId];
      if (!info || info.mainGameItem) continue;
      games.push(
        game(store, `${namespace}:${catalogId}:${safeId(item.appName)}`, info.title)
      );
    }
    cursor = data.responseMetadata?.nextCursor;
    if (!cursor) break;
    if (cursors.has(cursor) || page === 199)
      throw new Error("Epic returned an invalid library cursor.");
    cursors.add(cursor);
  }
  return {
    accountId: token.accountId,
    displayName: token.displayName,
    games,
    credential: token,
  };
}

function gameUrl(store, id) {
  safeId(id);
  if (store === "steam" && /^\d+$/.test(id)) return `steam://install/${id}`;
  if (store === "epic" && id.split(":").length === 3)
    return `com.epicgames.launcher://apps/${encodeURIComponent(id)}?action=install`;
  if (store === "gog" && /^\d+$/.test(id))
    return `https://www.gog.com/account/gameDetails/${id}`;
  throw new Error("Invalid store game identifier");
}
module.exports = {
  LOGIN,
  ROOTS,
  allowedNavigation,
  steamIdentity,
  request,
  epicToken,
  syncLibrary,
  gameUrl,
};
