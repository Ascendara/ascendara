// Self-hosted source errors and statuses arrive as en.json keys from the main
// process, optionally followed by "|" and JSON parameters, and may be wrapped in
// Electron's "Error invoking remote method" prefix.
const KEY_PATTERN = /privateSources\.(errors|status)\.([A-Za-z]+)(?:\|(\{.*\}))?/;
const IPC_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?/;

// Node and OS error codes worth explaining in plain words
const SYSTEM_ERRORS = {
  ENOENT: "notFound",
  EACCES: "accessDenied",
  EPERM: "accessDenied",
  ECONNREFUSED: "connectionRefused",
  ENOTFOUND: "hostNotFound",
  EAI_AGAIN: "hostNotFound",
  ETIMEDOUT: "timedOut",
  EHOSTUNREACH: "unreachable",
  ENETUNREACH: "unreachable",
  ECONNRESET: "connectionReset",
  ENOSPC: "diskFull",
  EEXIST: "alreadyExists",
  EBUSY: "busy",
};

/**
 * Translates a self-hosted source error or status into the user's language.
 * @param {Function} t - Translation function from useLanguage
 * @param {Error|string} value - The error, or a stored message
 * @returns {string} Readable message
 */
export function privateSourceMessage(t, value) {
  const text = String(value?.message ?? value ?? "").replace(IPC_PREFIX, "");
  const match = text.match(KEY_PATTERN);
  if (match) {
    let params = {};
    try {
      params = match[3] ? JSON.parse(match[3]) : {};
    } catch {
      params = {};
    }
    return t(`privateSources.${match[1]}.${match[2]}`, params);
  }
  const code = text.match(/\b(E[A-Z_]{3,})\b/)?.[1];
  if (SYSTEM_ERRORS[code]) return t(`privateSources.errors.${SYSTEM_ERRORS[code]}`);
  if (/Unexpected token|JSON/.test(text)) return t("privateSources.errors.invalidJson");
  return text || t("privateSources.errors.unknown");
}
