const path = require("node:path");

const ALLOWED_HOSTS = new Set(["localhost:46859", "127.0.0.1:46859"]);
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map(host => `http://${host}`));

function isAllowedLocalRequest(req) {
  return (
    ALLOWED_HOSTS.has(req.headers.host) &&
    (!req.headers.origin || ALLOWED_ORIGINS.has(req.headers.origin)) &&
    req.headers["sec-fetch-site"] !== "cross-site"
  );
}

function resolvePublicFile(root, rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(rawUrl.split("?")[0]);
  } catch {
    return null;
  }
  if (!pathname.startsWith("/") || /[\\\0]/.test(pathname)) return null;
  const parts = pathname.split("/");
  if (parts.some(part => part === "." || part === ".." || part.includes(":")))
    return null;
  // The build scripts copy assets next to privileged main-process source files.
  // Only public build output may be served from that directory.
  if (pathname === "/") pathname = "/index.html";
  if (!(
    pathname === "/index.html" ||
    pathname === "/no-image.png" ||
    /^\/icon\.(png|ico)$/.test(pathname) ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/sounds/") ||
    pathname.startsWith("/guide/")
  ))
    return null;
  const fullPath = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return fullPath;
}

const APP_PORT = 46859;
// Chromium tries ::1 before 127.0.0.1 for "localhost", so another program on ::1 would
// be loaded as the app. Pinning the app's origin to 127.0.0.1 means only that address
// has to be held. Binding ::1 as well fails on some Windows setups, which left the app
// on the failure page.
const APP_HOST_RESOLVER_RULE = `MAP localhost:${APP_PORT} 127.0.0.1:${APP_PORT}`;

const listenOnce = (server, port, host) =>
  new Promise(resolve => {
    server.once("error", resolve);
    server.listen(port, host, () => {
      server.removeListener("error", resolve);
      resolve(null);
    });
  });

/**
 * Hold the app's port on 127.0.0.1, the only address the window connects to (see
 * APP_HOST_RESOLVER_RULE).
 * @param {Function} createServer - Makes the server
 * @returns {Promise<{owned: boolean, servers: Object[], errorCode?: string}>} When not
 *   owned, nothing is left listening, that port's page must not be loaded as the app,
 *   and errorCode says why. An earlier instance that is still closing gets a moment to
 *   let go.
 */
async function holdAppPort(
  createServer,
  { port = APP_PORT, tries = 3, waitMs = 500 } = {}
) {
  const server = createServer();
  let error;
  for (let attempt = 1; attempt <= tries; attempt++) {
    error = await listenOnce(server, port, "127.0.0.1");
    if (!error || error.code !== "EADDRINUSE") break;
    if (attempt < tries) await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  if (!error) return { owned: true, servers: [server] };
  console.error("Local server error:", error.code, error.message);
  return { owned: false, servers: [], errorCode: error.code || "UNKNOWN" };
}

const run = (file, args) =>
  new Promise(resolve =>
    require("node:child_process").execFile(
      file,
      args,
      { timeout: 3000, windowsHide: true },
      (error, stdout) => resolve(error ? "" : String(stdout))
    )
  );

/**
 * Name the process listening on a local TCP port, so the failure page can say which
 * program to close instead of asking the user to run netstat.
 * @returns {Promise<string|null>} "name (PID n)", "PID n", or null when not found
 */
async function describePortHolder(port = APP_PORT) {
  try {
    if (process.platform === "win32") {
      const line = (await run("netstat", ["-ano", "-p", "TCP"]))
        .split(/\r?\n/)
        .map(row => row.trim().split(/\s+/))
        .find(
          cols =>
            cols[0] === "TCP" &&
            ["127.0.0.1", "0.0.0.0"].some(host => cols[1] === `${host}:${port}`) &&
            cols[3] === "LISTENING"
        );
      if (!line) return null;
      const pid = line[4];
      const name = (
        await run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"])
      ).match(/^"([^"]+)"/)?.[1];
      return name ? `${name} (PID ${pid})` : `PID ${pid}`;
    }
    const out = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"]);
    const pid = out.match(/^p(\d+)/m)?.[1];
    if (!pid) return null;
    const name = out.match(/^c(.+)$/m)?.[1];
    return name ? `${name} (PID ${pid})` : `PID ${pid}`;
  } catch {
    return null;
  }
}

/**
 * Close the servers holdAppPort returned, logging once for the whole set.
 * @param {Object[]} servers - Servers to close
 */
function closeAppServers(servers) {
  if (servers.length === 0) return;
  console.log("Closing local HTTP server...");
  let open = servers.length;
  for (const server of servers) {
    server.close(() => {
      if (--open === 0) console.log("Local server closed");
    });
    // Force close all connections
    server.closeAllConnections?.();
  }
}

module.exports = {
  APP_HOST_RESOLVER_RULE,
  closeAppServers,
  describePortHolder,
  holdAppPort,
  isAllowedLocalRequest,
  resolvePublicFile,
};
