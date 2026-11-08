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

const NO_SUCH_ADDRESS = new Set(["EADDRNOTAVAIL", "EAFNOSUPPORT"]);

const listenOnce = (server, port, host) =>
  new Promise(resolve => {
    server.once("error", resolve);
    server.listen(port, host, () => {
      server.removeListener("error", resolve);
      resolve(null);
    });
  });

/**
 * Hold the app's port on both loopback addresses. The window opens "localhost", and
 * the browser may try either one, so another program could be serving the one left
 * free.
 * @param {Function} createServer - Makes one server each time it is called
 * @returns {Promise<{owned: boolean, servers: Object[], errorCode?: string}>} When not
 *   owned, nothing is left listening, that port's page must not be loaded as the app,
 *   and errorCode says why. An earlier instance that is still closing gets a moment to
 *   let go.
 */
async function holdAppPort(createServer, { port = 46859, tries = 3, waitMs = 500 } = {}) {
  const servers = [];
  for (const host of ["127.0.0.1", "::1"]) {
    const server = createServer();
    let error;
    for (let attempt = 1; attempt <= tries; attempt++) {
      error = await listenOnce(server, port, host);
      if (!error || error.code !== "EADDRINUSE") break;
      if (attempt < tries) await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    if (!error) servers.push(server);
    // A machine without that address family has nothing there to take the port.
    else if (host === "::1" && NO_SUCH_ADDRESS.has(error.code)) continue;
    else {
      console.error("Local server error:", error.message);
      await Promise.all(servers.map(held => new Promise(done => held.close(done))));
      return { owned: false, servers: [], errorCode: error.code };
    }
  }
  return { owned: true, servers };
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
  closeAppServers,
  holdAppPort,
  isAllowedLocalRequest,
  resolvePublicFile,
};
