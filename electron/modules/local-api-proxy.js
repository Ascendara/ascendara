const https = require("node:https");

const ROUTES = {
  khinsider: "https://downloads.khinsider.com",
  torbox: "https://api.torbox.app/v1/api",
  flingtrainer: "https://flingtrainer.com",
  analytics: "https://analytics.ascendara.app",
};
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;

function getProxyTarget(rawUrl) {
  const match = /^\/api\/(khinsider|torbox|flingtrainer|analytics)(?=\/|\?|$)/.exec(rawUrl);
  if (!match) return null;
  return new URL(ROUTES[match[1]] + rawUrl.slice(match[0].length));
}

function proxyLocalRequest(req, res) {
  const target = getProxyTarget(req.url);
  if (!target) return false;
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (!["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    res.writeHead(405);
    res.end("Method not allowed");
    return true;
  }
  const headers = { ...req.headers, host: target.host };
  // Do not forward app-session credentials or hop-by-hop transport headers.
  for (const name of ["connection", "cookie", "origin", "referer", "transfer-encoding", "upgrade", "proxy-authorization"]) delete headers[name];
  const fail = (status, message) => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) res.destroy();
    else { res.writeHead(status); res.end(message); }
  };
  if (Number(headers["content-length"]) > MAX_REQUEST_BYTES) {
    fail(413, "Request too large");
    req.resume();
    return true;
  }
  const upstream = https.request(target, { method: req.method, headers }, response => {
    response.on("error", () => fail(502, "Proxy response interrupted"));
    if (res.writableEnded || res.destroyed) { response.destroy(); return; }
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  // A total deadline also covers a server that continuously trickles bytes.
  const timeout = setTimeout(() => upstream.destroy(new Error("Proxy timed out")), 30000);
  timeout.unref();
  upstream.on("error", () => fail(502, "Proxy error"));
  res.on("close", () => { clearTimeout(timeout); upstream.destroy(); });
  req.on("error", () => upstream.destroy());
  let bytes = 0;
  req.on("data", chunk => {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) {
      req.unpipe(upstream);
      fail(413, "Request too large");
      upstream.destroy();
      req.resume();
    }
  });
  // Stream uploads with backpressure instead of accumulating an unbounded body.
  req.pipe(upstream);
  return true;
}

module.exports = { getProxyTarget, proxyLocalRequest };
