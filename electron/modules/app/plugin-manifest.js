/**
 * Plugin manifest rules, shared by the app and scripts/build-plugin-index.cjs
 * so a plugin that passes review loads the same way in Ascendara.
 */

const path = require("path");

// Bumped only when a change to the plugin API would break existing plugins.
const API_VERSION = 1;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
// What a plugin can ask the main process to do for it. Listed in the install
// prompt so users see it, and checked on every call.
const PERMISSIONS = {
  downloads: "Download files from the internet into its own folder",
  processes: "Run programs on your computer",
};

function compareVersions(a, b) {
  const left = String(a).split(".").map(Number);
  const right = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((left[i] || 0) !== (right[i] || 0))
      return (left[i] || 0) > (right[i] || 0) ? 1 : -1;
  }
  return 0;
}

// Resolve a path from a manifest or a plugin call, refusing anything outside root.
function resolveInside(root, relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\0")) return null;
  const base = path.resolve(root);
  const resolved = path.resolve(base, relative);
  return resolved.startsWith(base + path.sep) ? resolved : null;
}

function validateManifest(manifest, id) {
  if (!ID_PATTERN.test(id))
    throw new Error("Folder name must be lowercase letters, numbers and dashes");
  if (!manifest || typeof manifest !== "object")
    throw new Error("manifest.json is not an object");
  const text = (key, max, required) => {
    const value = manifest[key];
    if (value === undefined && !required) return "";
    if (typeof value !== "string" || !value.trim())
      throw new Error(`manifest.json needs a "${key}"`);
    return value.trim().slice(0, max);
  };
  // Lists of short lines, such as what the plugin changes in Ascendara.
  const lines = (key, maxItems, maxLength) => {
    const value = manifest[key];
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some(item => typeof item !== "string"))
      throw new Error(`${key} must be a list of text`);
    if (value.length > maxItems)
      throw new Error(`${key} can have at most ${maxItems} entries`);
    return value.map(item => item.trim().slice(0, maxLength)).filter(Boolean);
  };
  const version = text("version", 32, true);
  if (!VERSION_PATTERN.test(version))
    throw new Error(`Version "${version}" must look like 1.0.0`);
  const minAppVersion = text("minAppVersion", 32, false);
  if (minAppVersion && !VERSION_PATTERN.test(minAppVersion))
    throw new Error(`minAppVersion "${minAppVersion}" must look like 12.3.0`);
  const apiVersion =
    manifest.apiVersion === undefined ? API_VERSION : manifest.apiVersion;
  if (!Number.isInteger(apiVersion) || apiVersion < 1)
    throw new Error("apiVersion must be a whole number");
  const permissions = manifest.permissions || [];
  if (!Array.isArray(permissions)) throw new Error("permissions must be a list");
  const unknown = permissions.find(permission => !Object.hasOwn(PERMISSIONS, permission));
  if (unknown) throw new Error(`Unknown permission "${unknown}"`);
  // A plugin that is only a stylesheet doesn't need a script.
  const main = manifest.main || (manifest.style ? "" : "index.js");
  if (main && !resolveInside("/plugin", main))
    throw new Error("main must point inside the plugin folder");
  if (manifest.style !== undefined && !resolveInside("/plugin", manifest.style))
    throw new Error("style must point inside the plugin folder");
  return {
    id,
    name: text("name", 100, true),
    version,
    author: text("author", 100, true),
    description: text("description", 500, false),
    details: text("details", 4000, false),
    affects: lines("affects", 20, 200),
    changelog: text("changelog", 2000, false),
    license: text("license", 50, false),
    homepage: /^https:\/\//.test(manifest.homepage || "")
      ? manifest.homepage.slice(0, 300)
      : "",
    minAppVersion,
    apiVersion,
    permissions: [...new Set(permissions)],
    main,
    style: manifest.style || "",
  };
}

// Why a plugin can't run on this app version, or null when it can.
function incompatibility(manifest, appVersion) {
  if (manifest.apiVersion > API_VERSION) return "Needs a newer version of Ascendara";
  if (manifest.minAppVersion && compareVersions(appVersion, manifest.minAppVersion) < 0)
    return `Needs Ascendara ${manifest.minAppVersion} or newer`;
  return null;
}

module.exports = {
  API_VERSION,
  ID_PATTERN,
  PERMISSIONS,
  compareVersions,
  resolveInside,
  validateManifest,
  incompatibility,
};
