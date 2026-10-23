const path = require("node:path");

const ALLOWED_HOSTS = new Set(["localhost:46859", "127.0.0.1:46859"]);
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map(host => `http://${host}`));

function isAllowedLocalRequest(req) {
  return ALLOWED_HOSTS.has(req.headers.host) &&
    (!req.headers.origin || ALLOWED_ORIGINS.has(req.headers.origin)) &&
    req.headers["sec-fetch-site"] !== "cross-site";
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
  if (parts.some(part => part === "." || part === ".." || part.includes(":"))) return null;
  // The build scripts copy assets next to privileged main-process source files.
  // Only public build output may be served from that directory.
  if (pathname === "/") pathname = "/index.html";
  if (!(pathname === "/index.html" || pathname === "/no-image.png" || /^\/icon\.(png|ico)$/.test(pathname) ||
    pathname.startsWith("/assets/") || pathname.startsWith("/sounds/") || pathname.startsWith("/guide/"))) return null;
  const fullPath = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return fullPath;
}

module.exports = { isAllowedLocalRequest, resolvePublicFile };
