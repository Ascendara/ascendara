import { useEffect, useState } from "react";
import { getConfiguredProviders, getProvider } from "@/services/downloads/debridService";

export default function useDebridHosts(settings) {
  const providerIds = getConfiguredProviders(settings)
    .map(provider => provider.id)
    .join(",");
  const [hosts, setHosts] = useState(() =>
    Object.fromEntries(
      getConfiguredProviders(settings).map(provider => [
        provider.id,
        provider.getCachedSupportedHosts(),
      ])
    )
  );
  useEffect(() => {
    let active = true;
    const providers = providerIds ? providerIds.split(",").map(getProvider) : [];
    const refresh = async () => {
      const entries = await Promise.all(
        providers.map(async provider => [provider.id, await provider.getSupportedHosts()])
      );
      if (active)
        setHosts(current =>
          entries.length === Object.keys(current).length &&
          entries.every(([id, domains]) => current[id] === domains)
            ? current
            : Object.fromEntries(entries)
        );
    };
    void refresh();
    const timer = setInterval(refresh, 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [providerIds]);
  return hosts;
}
