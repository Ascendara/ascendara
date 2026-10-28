// Electron's session API mapped onto Electrobun partitions. Electrobun owns the
// cookie jar; fetch() replays those cookies from Bun so requests made outside
// the webview (store sign-in, index relay) still act as the signed-in browser.

import { EventEmitter } from "node:events";
import { Session as EBSession } from "electrobun/main";

const sessions = new Map();
let warnedWebRequest = false;

function defaultUserAgent() {
  const webkit = "AppleWebKit/605.1.15 (KHTML, like Gecko)";
  if (process.platform === "darwin") {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${webkit} Version/18.0 Safari/605.1.15`;
  }
  const chrome = "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  if (process.platform === "win32") {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${chrome} Edg/141.0.0.0`;
  }
  return `Mozilla/5.0 (X11; Linux x86_64) ${webkit} Version/18.0 Safari/605.1.15`;
}

function toElectronCookie(cookie) {
  const domain = cookie.domain || "";
  return {
    name: cookie.name,
    value: cookie.value,
    domain,
    hostOnly: !domain.startsWith("."),
    path: cookie.path || "/",
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    session: !cookie.expirationDate,
    ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {}),
    sameSite: cookie.sameSite || "unspecified",
  };
}

function cookieMatchesUrl(cookie, url) {
  const host = url.hostname.toLowerCase();
  const domain = String(cookie.domain || "").toLowerCase();
  const bare = domain.replace(/^\./, "");
  const domainOk = domain.startsWith(".")
    ? host === bare || host.endsWith(`.${bare}`)
    : host === bare;
  if (!domainOk) return false;
  if (cookie.secure && url.protocol !== "https:") return false;
  if (cookie.expirationDate && cookie.expirationDate <= Date.now() / 1000) return false;
  const path = cookie.path || "/";
  return (
    url.pathname === path ||
    url.pathname.startsWith(path.endsWith("/") ? path : `${path}/`)
  );
}

function parseSetCookie(header, requestUrl) {
  const [pair, ...attributes] = header.split(";");
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const cookie = {
    name: pair.slice(0, eq).trim(),
    value: pair.slice(eq + 1).trim(),
    domain: requestUrl.hostname,
    path: "/",
  };
  for (const attribute of attributes) {
    const [rawKey, ...rest] = attribute.split("=");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join("=").trim();
    if (key === "domain" && value) cookie.domain = `.${value.replace(/^\./, "")}`;
    else if (key === "path" && value) cookie.path = value;
    else if (key === "secure") cookie.secure = true;
    else if (key === "httponly") cookie.httpOnly = true;
    else if (key === "samesite") {
      const mode = value.toLowerCase();
      cookie.sameSite =
        mode === "none" ? "no_restriction" : mode === "strict" ? "strict" : "lax";
    } else if (key === "max-age" && /^-?\d+$/.test(value)) {
      cookie.expirationDate = Math.floor(Date.now() / 1000) + Number(value);
    } else if (key === "expires" && cookie.expirationDate === undefined) {
      const time = Date.parse(value);
      if (!Number.isNaN(time)) cookie.expirationDate = Math.floor(time / 1000);
    }
  }
  return cookie;
}

class Cookies extends EventEmitter {
  constructor(session) {
    super();
    this._session = session;
  }

  async get(filter = {}) {
    const { url, ...rest } = filter;
    let cookies = this._session._eb.cookies.get(rest);
    if (url) {
      const parsed = new URL(url);
      cookies = cookies.filter(cookie => cookieMatchesUrl(cookie, parsed));
    }
    return cookies.map(toElectronCookie);
  }

  async set(details) {
    const url = new URL(details.url);
    const cookie = {
      name: details.name || "",
      value: details.value || "",
      domain: details.domain || url.hostname,
      path: details.path || "/",
      secure: Boolean(details.secure),
      httpOnly: Boolean(details.httpOnly),
      ...(details.expirationDate ? { expirationDate: details.expirationDate } : {}),
      ...(details.sameSite && details.sameSite !== "unspecified"
        ? { sameSite: details.sameSite }
        : {}),
    };
    if (!this._session._eb.cookies.set(cookie)) {
      throw new Error(`Failed to set cookie ${cookie.name}`);
    }
  }

  async remove(url, name) {
    this._session._eb.cookies.remove(url, name);
  }

  async flushStore() {}
}

class WebRequest {
  _unsupported() {
    if (warnedWebRequest) return;
    warnedWebRequest = true;
    console.warn(
      "[Electrobun] session.webRequest hooks are not available; ignoring them."
    );
  }
  onBeforeRequest() {
    this._unsupported();
  }
  onBeforeSendHeaders() {
    this._unsupported();
  }
  onHeadersReceived() {
    this._unsupported();
  }
  onCompleted() {
    this._unsupported();
  }
}

export class Session extends EventEmitter {
  constructor(partition) {
    super();
    this.partition = partition;
    this._eb = EBSession.fromPartition(partition);
    this._userAgent = null;
    this.cookies = new Cookies(this);
    this.webRequest = new WebRequest();
  }

  getUserAgent() {
    return this._userAgent || defaultUserAgent();
  }

  setUserAgent(userAgent) {
    if (typeof userAgent === "string" && userAgent) this._userAgent = userAgent;
  }

  // Webviews report their real user agent once loaded; fetch() reuses it so
  // challenge cookies stay valid outside the webview.
  _learnUserAgent(userAgent) {
    if (!this._userAgent && typeof userAgent === "string" && userAgent) {
      this._userAgent = userAgent;
    }
  }

  async fetch(input, init = {}) {
    let url = new URL(typeof input === "string" ? input : input.url);
    const manual = init.redirect === "manual" || init.redirect === "error";
    let method = init.method || "GET";
    let body = init.body;
    for (let hops = 0; hops < 20; hops++) {
      const headers = new Headers(init.headers || {});
      if (!headers.has("user-agent")) headers.set("user-agent", this.getUserAgent());
      const jar = (await this.cookies.get({ url: url.href }))
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join("; ");
      if (jar && !headers.has("cookie")) headers.set("cookie", jar);
      const response = await globalThis.fetch(url.href, {
        ...init,
        method,
        body,
        headers,
        redirect: "manual",
      });
      for (const header of response.headers.getSetCookie?.() || []) {
        const cookie = parseSetCookie(header, url);
        if (cookie) this._eb.cookies.set(cookie);
      }
      const location = response.headers.get("location");
      if (manual || !location || response.status < 300 || response.status > 399) {
        return response;
      }
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && method === "POST")
      ) {
        method = "GET";
        body = undefined;
      }
      url = new URL(location, url);
    }
    throw new TypeError("fetch failed: too many redirects");
  }

  async clearStorageData(options = {}) {
    const map = {
      cookies: "cookies",
      localstorage: "localStorage",
      indexdb: "indexedDB",
      websql: "webSQL",
      cachestorage: "cache",
      serviceworkers: "cache",
    };
    const requested = (options.storages || [])
      .map(name => map[String(name).toLowerCase()])
      .filter(Boolean);
    this._eb.clearStorageData(requested.length ? [...new Set(requested)] : "all");
  }

  async clearCache() {
    this._eb.clearStorageData(["cache"]);
  }

  setPermissionRequestHandler() {}
  setPermissionCheckHandler() {}
  setProxy() {
    return Promise.resolve();
  }
}

function fromPartition(partition = "persist:default") {
  const key = partition || "persist:default";
  let session = sessions.get(key);
  if (!session) {
    session = new Session(key);
    sessions.set(key, session);
  }
  return session;
}

export const session = {
  fromPartition,
  get defaultSession() {
    return fromPartition("persist:default");
  },
};
