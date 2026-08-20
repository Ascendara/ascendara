const https = require("https");

const ALLOWED_SERVICE_HOSTS = new Set([
  "monitor.ascendara.app",
  "api.ascendara.app",
  "cdn.ascendara.app",
  "lfs.ascendara.app",
  "r2.ascendara.app",
]);
const ALLOWED_SERVICE_METHODS = new Set(["GET", "HEAD"]);
const MAX_SERVICE_RESPONSE_BYTES = 1024 * 1024;
const MIN_SERVICE_TIMEOUT_MS = 1000;
const MAX_SERVICE_TIMEOUT_MS = 15000;

function normalizeServiceRequest(rawUrl, options = {}) {
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new TypeError("Service request URL must be a valid URL");
  }

  if (parsedUrl.protocol !== "https:" || !ALLOWED_SERVICE_HOSTS.has(parsedUrl.hostname)) {
    throw new Error(`Service request host is not allowed: ${parsedUrl.hostname || "unknown"}`);
  }

  // This path is only for the root service status checks.
  if (
    parsedUrl.username ||
    parsedUrl.password ||
    (parsedUrl.port && parsedUrl.port !== "443") ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error("Service request route is not allowed");
  }

  const method = String(options.method || "GET").toUpperCase();
  if (!ALLOWED_SERVICE_METHODS.has(method)) {
    throw new Error(`Service request method is not allowed: ${method}`);
  }

  const requestedTimeout = Number(options.timeout);
  const timeout = Number.isFinite(requestedTimeout)
    ? Math.min(MAX_SERVICE_TIMEOUT_MS, Math.max(MIN_SERVICE_TIMEOUT_MS, requestedTimeout))
    : 5000;

  const headers = {};
  if (typeof options.headers?.Accept === "string") {
    headers.Accept = options.headers.Accept.slice(0, 256);
  }
  if (typeof options.headers?.["X-Client"] === "string") {
    headers["X-Client"] = options.headers["X-Client"].slice(0, 128);
  }

  return { parsedUrl, method, timeout, headers };
}

function requestAscendaraService(rawUrl, options = {}) {
  const { parsedUrl, method, timeout, headers } = normalizeServiceRequest(rawUrl, options);

  return new Promise((resolve, reject) => {
    const request = https.request(
      parsedUrl,
      {
        method,
        headers,
        timeout,
      },
      response => {
        const chunks = [];
        let totalBytes = 0;

        response.on("data", chunk => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_SERVICE_RESPONSE_BYTES) {
            request.destroy(new Error("Service response exceeded the 1 MB safety limit"));
            return;
          }
          chunks.push(chunk);
        });

        response.on("end", () => {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode || 0,
            statusCode: response.statusCode || 0,
            data: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Service request timed out"));
    });
    request.on("error", reject);
    request.end();
  });
}

function normalizeExternalRequest(rawUrl, options = {}) {
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new TypeError("External request URL must be a valid URL");
  }

  // External Sources have always accepted HTTPS URLs, including self-hosted sources.
  if (parsedUrl.protocol !== "https:") {
    throw new Error("External requests must use HTTPS");
  }

  const method = typeof options.method === "string" ? options.method.toUpperCase() : "GET";
  const headers =
    options.headers && typeof options.headers === "object" && !Array.isArray(options.headers)
      ? { ...options.headers }
      : {};
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : undefined;

  return { parsedUrl, method, headers, timeout };
}

function requestExternalResource(rawUrl, options = {}) {
  const { parsedUrl, method, headers, timeout } = normalizeExternalRequest(rawUrl, options);

  return new Promise((resolve, reject) => {
    const request = https.request(
      parsedUrl,
      {
        method,
        headers,
        ...(timeout === undefined ? {} : { timeout }),
      },
      response => {
        let data = "";

        // Large source indexes are valid, so do not cap the response here.
        response.setEncoding("utf8");
        response.on("data", chunk => {
          data += chunk;
        });
        response.on("end", () => {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode || 0,
            statusCode: response.statusCode || 0,
            data,
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy();
      reject(new Error("Request timed out"));
    });
    request.on("error", reject);
    request.end();
  });
}

function isAscendaraHealthRequest(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl);
    return Boolean(
      parsedUrl.protocol === "https:" &&
        ALLOWED_SERVICE_HOSTS.has(parsedUrl.hostname) &&
        !parsedUrl.username &&
        !parsedUrl.password &&
        (!parsedUrl.port || parsedUrl.port === "443") &&
        parsedUrl.pathname === "/" &&
        !parsedUrl.search &&
        !parsedUrl.hash
    );
  } catch {
    return false;
  }
}

function registerRendererNetworkHandlers(ipcMain) {
  // Only exact status URLs use the restricted path. Other HTTPS requests keep source compatibility.
  ipcMain.handle("request-ascendara-service", (_event, rawUrl, options) => {
    if (isAscendaraHealthRequest(rawUrl)) {
      return requestAscendaraService(rawUrl, options);
    }
    return requestExternalResource(rawUrl, options);
  });

  ipcMain.handle("request-external-resource", (_event, rawUrl, options) =>
    requestExternalResource(rawUrl, options)
  );
  ipcMain.handle("fetch-custom-source", (_event, rawUrl) =>
    requestExternalResource(rawUrl, { method: "GET" })
  );
}

module.exports = {
  ALLOWED_SERVICE_HOSTS,
  isAscendaraHealthRequest,
  normalizeExternalRequest,
  normalizeServiceRequest,
  registerRendererNetworkHandlers,
  requestAscendaraService,
  requestExternalResource,
};
