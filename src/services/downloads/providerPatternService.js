import { API_URL } from "@/config/api";
const PROVIDER_API_URL = `${API_URL}/app/json/providers`;
const CACHE_KEY = "providerPatternsCache";
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

let pendingFetch = null;

const readCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    return cached && cached.patterns ? cached : null;
  } catch (e) {
    return null;
  }
};

/**
 * Fetches provider regex patterns from the API.
 * @returns {Promise<Object>} A mapping of provider names to regex strings.
 */
export async function fetchProviderPatterns() {
  const cached = readCache();
  if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < CACHE_DURATION) {
    return cached.patterns;
  }

  // Share one request between callers that ask at the same time
  if (!pendingFetch) {
    pendingFetch = (async () => {
      const response = await fetch(PROVIDER_API_URL, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Failed to fetch provider patterns: ${response.status}`);
      }
      const data = await response.json();
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            lastUpdated: data.lastUpdated,
            patterns: data.regex,
            fetchedAt: Date.now(),
          })
        );
      } catch (e) {
        console.warn("Could not cache provider patterns", e);
      }
      return data.regex;
    })().finally(() => {
      pendingFetch = null;
    });
  }

  try {
    return await pendingFetch;
  } catch (e) {
    // Stale patterns are better than none
    if (cached) return cached.patterns;
    throw e;
  }
}

/**
 * Get the regex pattern for a given provider.
 * @param {string} provider - Provider key (e.g., "buzzheavier")
 * @param {Object} patterns - Provider patterns object
 * @returns {RegExp|null}
 */
export function getProviderPattern(provider, patterns) {
  if (!patterns || !patterns[provider]) return null;
  try {
    return new RegExp(patterns[provider], "i");
  } catch (e) {
    console.error(`Invalid regex for provider ${provider}:`, e);
    return null;
  }
}
