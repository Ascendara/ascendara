/**
 * Centralized provider configuration.
 *
 * Single source of truth for download provider keys, categorization,
 * display names, and known domains. Import from here instead of
 * re-declaring provider lists in individual files.
 */

// Providers that support seamless (in-app) downloads.
export const SEAMLESS_PROVIDERS = ["gofile", "buzzheavier", "pixeldrain"];

// Providers that route through the TorBox debrid service.
export const TORBOX_PROVIDERS = ["1fichier", "datanodes", "qiwi", "megadb"];

// Providers that are TorBox-eligible in addition to seamless hosts
// (used when prioritizeTorboxOverSeamless is toggled).
export const TORBOX_ELIGIBLE_SEAMLESS = ["gofile", "buzzheavier", "datanodes", "pixeldrain"];

// Providers whose downloads are considered "verified" / trusted.
export const VERIFIED_PROVIDERS = ["megadb", "gofile", "buzzheavier", "pixeldrain"];

// Human-readable display names for providers (keyed by provider id).
export const PROVIDER_DISPLAY_NAMES = {
  "1fichier": "1Fichier",
  megadb: "MegaDB",
  gofile: "GoFile",
  buzzheavier: "Buzzheavier",
  pixeldrain: "PixelDrain",
  datanodes: "DataNodes",
  qiwi: "Qiwi",
  vikingfile: "VikingFile",
  torrent: "Torrent",
};

// TorBox display-name mapping (TorBox API uses slightly different casing).
export const TORBOX_PROVIDER_DISPLAY_NAMES = {
  "1fichier": "1Fichier",
  megadb: "MegaDB",
  gofile: "GoFile",
  buzzheavier: "Buzzheavier",
};

// Known domains for each provider. Used for URL classification
// (e.g. scrapers, parsers). Update this list when a provider
// changes or adds a domain.
export const PROVIDER_DOMAINS = {
  gofile: ["gofile.io"],
  buzzheavier: [
    "buzzheavier.com",
    "bzzhr.co",
    "bzzhr.to",
    "fuckingfast.net",
    "fuckingfast.co",
  ],
  pixeldrain: ["pixeldrain.com"],
  "1fichier": ["1fichier.com"],
  megadb: ["megadb.net"],
  datanodes: ["datanodes.to"],
  qiwi: ["qiwi.gg"],
  vikingfile: ["vikingfile.com"],
};

/**
 * Given a URL string, return the provider id whose domain list matches,
 * or null if no provider matches.
 */
export function getProviderFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const lowered = url.toLowerCase();
  for (const [provider, domains] of Object.entries(PROVIDER_DOMAINS)) {
    if (domains.some(d => lowered.includes(d))) return provider;
  }
  return null;
}

/**
 * Return the display name for a provider id, falling back to the id itself.
 */
export function getProviderDisplayName(provider) {
  if (!provider) return "";
  return PROVIDER_DISPLAY_NAMES[provider.toLowerCase()] || provider;
}

/**
 * Check if the given download_links object has any seamless provider.
 */
export function hasSeamlessOption(downloadLinks) {
  if (!downloadLinks || typeof downloadLinks !== "object") return false;
  return Object.keys(downloadLinks).some(host =>
    SEAMLESS_PROVIDERS.includes(host.toLowerCase())
  );
}
