import torbox from "./debrid/torboxProvider";
import realDebrid from "./debrid/realDebridProvider";
import allDebrid from "./debrid/allDebridProvider";
import premiumize from "./debrid/premiumizeProvider";
import { handoffTorrents } from "./debridTorrentHandoff";

// TorBox is first by default; only an explicitly saved order overrides this.
export const debridProviders = [torbox, realDebrid, allDebrid, premiumize];

export function createDebridService(providers) {
  const getProvider = id => providers.find(provider => provider.id === id) || null;
  const getApiKey = (settings, provider) =>
    settings?.[provider?.apiKeySetting]?.trim() || "";
  const getOrderedProviders = settings => {
    const saved =
      Array.isArray(settings?.debridProviderOrder) && settings.debridProviderOrder.length
        ? settings.debridProviderOrder
        : [];
    const ids = [...new Set([...saved, ...providers.map(provider => provider.id)])];
    return ids.map(getProvider).filter(Boolean);
  };
  const getConfiguredProviders = settings =>
    settings?.debridEnabled !== true
      ? []
      : getOrderedProviders(settings).filter(
          provider =>
            getApiKey(settings, provider) &&
            settings?.debridProviderEnabled?.[provider.id] !== false
        );
  const getPreferredProvider = settings => getConfiguredProviders(settings)[0] || null;
  const getTorrentProvider = settings =>
    getConfiguredProviders(settings).find(
      provider => provider.submitMagnet && settings[provider.torrentSetting] !== false
    ) || null;
  const canUseCloudTorrents = settings => Boolean(getTorrentProvider(settings));
  const canDownloadTorrents = settings =>
    Boolean(settings?.torrentEnabled || canUseCloudTorrents(settings));
  const getSupportedHosts = async settings =>
    Object.fromEntries(
      await Promise.all(
        getConfiguredProviders(settings).map(async provider => [
          provider.id,
          await provider.getSupportedHosts(),
        ])
      )
    );
  const getHostProvider = (settings, host, link, hostsByProvider) => {
    if (!host || ["torrent", "direct"].includes(host)) return null;
    return (
      getConfiguredProviders(settings).find(
        provider =>
          provider.resolveHost &&
          (settings[provider.prioritizeSetting] ||
            !(provider.seamlessHosts || []).includes(host)) &&
          provider.isSupportedUrl(link, hostsByProvider?.[provider.id])
      ) || null
    );
  };
  const canUseForHost = (settings, host, link, hostsByProvider) =>
    Boolean(getHostProvider(settings, host, link, hostsByProvider));
  const allowsTorrentFallback = settings => {
    const provider = getTorrentProvider(settings);
    return Boolean(
      provider?.torrentFallbackSetting && settings[provider.torrentFallbackSetting]
    );
  };
  const remember = (provider, data) => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(provider.metadataStorageKey) || "{}"
      );
      localStorage.setItem(
        provider.metadataStorageKey,
        JSON.stringify({ ...stored, ...provider.serializeMetadata(data) })
      );
    } catch (error) {
      console.warn(`Could not save ${provider.name} download metadata:`, error);
    }
  };
  const submitMagnet = async (settings, link, game, directory = 0) => {
    const provider = getTorrentProvider(settings);
    if (!provider) throw new Error("No debrid provider is enabled for torrents.");
    const result = await provider.submitMagnet(link, getApiKey(settings, provider), game);
    remember(provider, {
      result,
      kind: "torrent",
      link,
      host: "torrent",
      game,
      directory,
    });
    // Start metadata-ready torrents immediately; the app-wide task retries conversions.
    if (provider.resumePendingTorrents) {
      void provider.resumePendingTorrents(getApiKey(settings, provider)).catch(error => {
        console.warn(
          `[Debrid] ${provider.name} torrent startup will retry:`,
          error.message
        );
      });
    }
    return { ...result, providerId: provider.id, downloadsPath: provider.downloadsPath };
  };
  const resumePendingTorrents = settings =>
    Promise.all(
      getConfiguredProviders(settings)
        .filter(
          provider =>
            (provider.resumePendingTorrents || provider.getTorrentDownload) &&
            settings[provider.torrentSetting] !== false
        )
        .map(async provider => {
          const apiKey = getApiKey(settings, provider);
          await provider.resumePendingTorrents?.(apiKey);
          return handoffTorrents(provider, apiKey);
        })
    );
  const resolveHost = async (settings, link, host, game, directory = 0, providerId) => {
    if (settings?.debridEnabled !== true)
      throw new Error("Debrid services are disabled.");
    const normalizedLink = link.startsWith("//") ? `https:${link}` : link;
    const provider = providerId
      ? getProvider(providerId)
      : getHostProvider(
          settings,
          host,
          normalizedLink,
          await getSupportedHosts(settings)
        );
    if (!provider) throw new Error("No configured debrid service supports this URL.");
    if (!provider.resolveHost || !getApiKey(settings, provider))
      throw new Error("Debrid provider is not configured.");
    if (!provider.isSupportedUrl(normalizedLink, await provider.getSupportedHosts())) {
      throw new Error(`This URL is not in ${provider.name}’s supported host list.`);
    }
    const result = await provider.resolveHost(
      normalizedLink,
      getApiKey(settings, provider)
    );
    if (game)
      remember(provider, {
        result,
        kind: "download",
        link: normalizedLink,
        host,
        game,
        directory,
      });
    return { ...result, providerId: provider.id, downloadsPath: provider.downloadsPath };
  };
  return {
    getProvider,
    getOrderedProviders,
    getConfiguredProviders,
    getPreferredProvider,
    getTorrentProvider,
    getHostProvider,
    getSupportedHosts,
    canUseCloudTorrents,
    canDownloadTorrents,
    canUseForHost,
    allowsTorrentFallback,
    submitMagnet,
    resumePendingTorrents,
    resolveHost,
  };
}

export const {
  getProvider,
  getOrderedProviders,
  getConfiguredProviders,
  getPreferredProvider,
  getTorrentProvider,
  getHostProvider,
  getSupportedHosts,
  canUseCloudTorrents,
  canDownloadTorrents,
  canUseForHost,
  allowsTorrentFallback,
  submitMagnet,
  resumePendingTorrents,
  resolveHost,
} = createDebridService(debridProviders);
