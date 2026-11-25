// SABnzbd and NZBGet APIs behind one shape. Free of Electron imports so it can
// be tested under plain node; requests go through an injected `fetch`.
//
// A job reads as { state, progress, speed, eta, path, message } where state is
// queued | downloading | paused | processing | completed | failed | missing.

const fail = (code, detail) => Object.assign(new Error(detail || code), { code });

function baseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    throw fail("invalidUrl");
  }
  if (!/^https?:$/.test(url.protocol)) throw fail("invalidUrl");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

async function send(fetchImpl, url, init = {}, timeout = 20000) {
  let res;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    throw fail(e?.name === "TimeoutError" ? "timeout" : "unreachable");
  }
  if (res.status === 401 || res.status === 403) throw fail("unauthorized");
  if (!res.ok) throw fail("badResponse", `HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw fail("badResponse");
  }
}

/** "1:02:03" or "12:03" as seconds */
function clockSeconds(value) {
  const parts = String(value || "")
    .split(":")
    .map(Number);
  if (!parts.length || parts.some(n => !Number.isFinite(n))) return null;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

// ---- SABnzbd ---------------------------------------------------------------

const SAB_PROCESSING =
  /^(extracting|verifying|repairing|moving|running|fetching|propagating|checking|quickcheck)/i;

function sabnzbd({ url, apiKey, category }, fetchImpl = fetch) {
  const root = baseUrl(url);
  const call = async (params, init) => {
    const query = new URLSearchParams({
      output: "json",
      apikey: apiKey || "",
      ...params,
    });
    const data = await send(fetchImpl, `${root}/api?${query}`, init);
    if (data?.status === false || data?.error) {
      throw fail(
        /api key/i.test(String(data.error)) ? "unauthorized" : "badResponse",
        data.error
      );
    }
    return data;
  };
  return {
    async test() {
      const data = await call({ mode: "queue", limit: "1" });
      if (!data?.queue) throw fail("badResponse");
      const version = await call({ mode: "version" }).catch(() => null);
      return { client: "SABnzbd", version: version?.version || "" };
    },
    async add(nzb, name) {
      const form = new FormData();
      form.append("name", new Blob([nzb], { type: "application/x-nzb" }), `${name}.nzb`);
      const params = { mode: "addfile", nzbname: name };
      if (category) params.cat = category;
      const data = await call(params, { method: "POST", body: form });
      const id = data?.nzo_ids?.[0];
      if (!id) throw fail("rejected");
      return String(id);
    },
    async job(id) {
      const queue = await call({ mode: "queue", nzo_ids: id });
      const slot = queue?.queue?.slots?.find(s => s.nzo_id === id);
      if (slot) {
        const paused = /paused/i.test(slot.status) || /paused/i.test(queue.queue.status);
        const kbps = Number(queue.queue.kbpersec) || 0;
        return {
          state: paused
            ? "paused"
            : /downloading/i.test(slot.status)
              ? "downloading"
              : SAB_PROCESSING.test(slot.status)
                ? "processing"
                : "queued",
          progress: Math.min(100, Number(slot.percentage) || 0),
          speed: /downloading/i.test(slot.status) ? kbps * 1024 : 0,
          eta: clockSeconds(slot.timeleft),
        };
      }
      const history = await call({ mode: "history", nzo_ids: id });
      const done = history?.history?.slots?.find(s => s.nzo_id === id);
      if (!done) return { state: "missing" };
      if (/^completed$/i.test(done.status))
        return { state: "completed", progress: 100, path: done.storage || "" };
      if (/^failed$/i.test(done.status))
        return { state: "failed", message: done.fail_message || "" };
      return { state: "processing", progress: 100 };
    },
    pause: id => call({ mode: "queue", name: "pause", value: id }),
    resume: id => call({ mode: "queue", name: "resume", value: id }),
    async remove(id) {
      await call({ mode: "queue", name: "delete", value: id, del_files: "1" });
      await call({ mode: "history", name: "delete", value: id, del_files: "1" }).catch(
        () => {}
      );
    },
    // Called after Ascendara moved the files out: the entry has nothing left
    forget: id => call({ mode: "history", name: "delete", value: id }),
  };
}

// ---- NZBGet ----------------------------------------------------------------

const NZBGET_QUEUED = /^(queued|fetching|loading_pars)$/i;
const NZBGET_PROCESSING =
  /^(pp_|verifying|repairing|renaming|unpacking|moving|executing|post)/i;

function nzbget({ url, username, password, category }, fetchImpl = fetch) {
  const root = baseUrl(url);
  const auth = `Basic ${Buffer.from(`${username || ""}:${password || ""}`).toString("base64")}`;
  const call = async (method, params = []) => {
    const data = await send(fetchImpl, `${root}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    });
    if (data?.error) throw fail("badResponse", data.error.message || String(data.error));
    return data?.result;
  };
  return {
    async test() {
      const version = await call("version");
      return { client: "NZBGet", version: String(version || "") };
    },
    async add(nzb, name) {
      const id = await call("append", [
        `${name}.nzb`,
        Buffer.from(nzb).toString("base64"),
        category || "",
        0,
        false,
        false,
        "",
        0,
        "SCORE",
        [],
      ]);
      if (!Number.isSafeInteger(id) || id <= 0) throw fail("rejected");
      return String(id);
    },
    async job(id) {
      const groups = (await call("listgroups", [0])) || [];
      const group = groups.find(g => String(g.NZBID) === String(id));
      if (group) {
        const total = Number(group.FileSizeMB) || 0;
        const left = Number(group.RemainingSizeMB) || 0;
        const status = String(group.Status || "");
        const downloading = /^downloading$/i.test(status);
        const rate = downloading ? Number((await call("status"))?.DownloadRate) || 0 : 0;
        return {
          state: /paused/i.test(status)
            ? "paused"
            : downloading
              ? "downloading"
              : NZBGET_PROCESSING.test(status)
                ? "processing"
                : NZBGET_QUEUED.test(status)
                  ? "queued"
                  : "processing",
          progress: total ? Math.min(100, ((total - left) / total) * 100) : 0,
          speed: rate,
          eta: rate ? Math.round((left * 1048576) / rate) : null,
        };
      }
      const history = (await call("history", [false])) || [];
      const item = history.find(h => String(h.NZBID) === String(id));
      if (!item) return { state: "missing" };
      const status = String(item.Status || "");
      if (/^success\//i.test(status) || /^warning\/script$/i.test(status)) {
        return {
          state: "completed",
          progress: 100,
          path: item.FinalDir || item.DestDir || "",
        };
      }
      return { state: "failed", message: status };
    },
    pause: id => call("editqueue", ["GroupPause", "", [Number(id)]]),
    resume: id => call("editqueue", ["GroupResume", "", [Number(id)]]),
    async remove(id) {
      await call("editqueue", ["GroupFinalDelete", "", [Number(id)]]).catch(() => {});
      await call("editqueue", ["HistoryFinalDelete", "", [Number(id)]]).catch(() => {});
    },
    forget: id => call("editqueue", ["HistoryDelete", "", [Number(id)]]),
  };
}

const CLIENTS = { sabnzbd, nzbget };

function createClient(settings, fetchImpl) {
  const make = CLIENTS[settings?.usenetClient];
  if (!make || !settings.usenetUrl) throw fail("notConfigured");
  return make(
    {
      url: settings.usenetUrl,
      apiKey: settings.usenetApiKey,
      username: settings.usenetUsername,
      password: settings.usenetPassword,
      category: settings.usenetCategory,
    },
    fetchImpl
  );
}

/**
 * The local path for a folder the client reports. Clients in Docker or on
 * another machine see their own paths, so a configured prefix is swapped.
 */
function mapPath(reported, remotePrefix, localPrefix, sep = require("path").sep) {
  let value = String(reported || "");
  const remote = String(remotePrefix || "")
    .trim()
    .replace(/[\\/]+$/, "");
  const local = String(localPrefix || "")
    .trim()
    .replace(/[\\/]+$/, "");
  if (remote && local) {
    const norm = v => v.replace(/\\/g, "/");
    const a = norm(value);
    const b = norm(remote);
    const caseless = /^[a-z]:/i.test(b);
    const matches = caseless
      ? a.toLowerCase().startsWith(b.toLowerCase())
      : a.startsWith(b);
    if (matches && (a.length === b.length || a[b.length] === "/")) {
      value = local + a.slice(b.length);
    }
  }
  return sep === "\\" ? value.replace(/\//g, "\\") : value.replace(/\\/g, "/");
}

function formatSpeed(bytesPerSecond) {
  const n = Number(bytesPerSecond) || 0;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB/s`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB/s`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KB/s`;
  return `${n.toFixed(2)} B/s`;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}

module.exports = {
  createClient,
  sabnzbd,
  nzbget,
  mapPath,
  formatSpeed,
  formatEta,
  clockSeconds,
  fail,
};
