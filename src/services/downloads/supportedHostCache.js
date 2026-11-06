const HOST_CACHE_TTL = 24 * 60 * 60 * 1000;
const HOST_RETRY_DELAY = 5 * 60 * 1000;

export function createSupportedHostCache({
  cacheKey,
  loadDomains,
  ttl = HOST_CACHE_TTL,
}) {
  let hostCache;
  let hostRequest = null;
  let retryHostsAfter = 0;

  function normalizeDomains(domains) {
    if (!Array.isArray(domains)) throw new Error("Invalid supported host list.");
    const normalized = domains.map(domain => {
      if (
        typeof domain !== "string" ||
        domain.includes("/") ||
        domain.includes("\\") ||
        /[:@?#%\s]/u.test(domain)
      ) {
        throw new Error("Invalid supported host domain.");
      }
      // TorBox publishes internationalized domains; URL canonicalizes them to punycode.
      const hostname = new URL(`https://${domain}`).hostname
        .toLowerCase()
        .replace(/\.$/, "");
      if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(hostname)) {
        throw new Error("Invalid supported host domain.");
      }
      return hostname;
    });
    return [...new Set(normalized)];
  }

  function getCachedSupportedHosts() {
    if (hostCache === undefined) {
      hostCache = null;
      try {
        const stored = JSON.parse(localStorage.getItem(cacheKey));
        if (
          stored &&
          Number.isFinite(stored.fetchedAt) &&
          stored.fetchedAt > 0 &&
          stored.fetchedAt <= Date.now()
        ) {
          hostCache = {
            domains: normalizeDomains(stored.domains),
            fetchedAt: stored.fetchedAt,
          };
        }
      } catch {
        /* Missing, corrupt or unavailable storage is a cache miss. */
      }
    }
    return hostCache?.domains || [];
  }

  async function getSupportedHosts() {
    const cached = getCachedSupportedHosts();
    if (hostCache && Date.now() - hostCache.fetchedAt < ttl) return cached;
    if (hostRequest) return hostRequest;
    if (Date.now() < retryHostsAfter) return cached;
    // Share one request across download pages and all visible game cards.
    hostRequest = Promise.resolve()
      .then(async () => {
        try {
          const domains = normalizeDomains(await loadDomains());
          hostCache = { domains, fetchedAt: Date.now() };
          retryHostsAfter = 0;
          try {
            localStorage.setItem(cacheKey, JSON.stringify(hostCache));
          } catch {
            /* Memory cache still works. */
          }
          return domains;
        } catch {
          // Keep the last good list while offline; never guess support on a cold start.
          retryHostsAfter = Date.now() + HOST_RETRY_DELAY;
          return cached;
        }
      })
      .finally(() => {
        hostRequest = null;
      });
    return hostRequest;
  }

  return { getCachedSupportedHosts, getSupportedHosts };
}

export function isSupportedUrl(link, domains = []) {
  try {
    if (typeof link !== "string") return false;
    const url = new URL(link.startsWith("//") ? `https:${link}` : link);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return domains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
