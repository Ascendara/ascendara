import steamGridImageService from "./steamGridImageService";

// Read installed/restored artwork first, then use the same proxy as the library.
// An async iterator lets a failed image decode advance to the next source.
export async function* getAscendArtworkCandidates(name, slot = "header") {
  if (!name) return;
  const seen = new Set();
  const types = [...new Set([slot, "header", "hero", "grid", "logo"])];
  for (const type of types) {
    try {
      const image = await window.electron?.getGameImage?.(name, type);
      if (!image) continue;
      const url = image.startsWith("data:")
        ? image
        : `data:image/${image.startsWith("iVBOR") ? "png" : "jpeg"};base64,${image}`;
      if (!seen.has(url)) {
        seen.add(url);
        yield { url, type };
      }
    } catch {
      // Missing/inaccessible local artwork must not prevent the proxy fallback.
    }
  }
  for (const full of [false, true]) {
    try {
      const assets = full
        ? await steamGridImageService.getFullAssets(name)
        : await steamGridImageService.getAssets(name);
      for (const type of types) {
        const url = assets?.[type];
        if (url && !seen.has(url)) {
          seen.add(url);
          yield { url, type };
        }
      }
    } catch {
      // Keep the placeholder when all sources are unavailable.
    }
  }
}
