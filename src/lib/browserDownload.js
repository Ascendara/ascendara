// Keep signed URLs byte-for-byte intact; decode only the protocol envelope.
export function parseBrowserDownload(protocolUrl) {
  if (typeof protocolUrl !== "string" || !protocolUrl.startsWith("ascendara://")) {
    throw new Error("Invalid download handoff");
  }
  const envelope = protocolUrl.slice("ascendara://".length);
  // Some OS protocol handlers normalize the authority to `download/`.
  const downloadRoute = /^download\/?\?/.exec(envelope);
  const payload = downloadRoute
    ? JSON.parse(new URLSearchParams(envelope.slice(downloadRoute[0].length)).get("payload"))
    : { url: decodeURIComponent(envelope) };
  const url = new URL(payload?.url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only HTTP and HTTPS downloads are supported");
  }
  const pageUrl =
    typeof payload.pageUrl === "string" &&
    (() => {
      try {
        const page = new URL(payload.pageUrl);
        return ["http:", "https:"].includes(page.protocol) ? page.href : "";
      } catch {
        return "";
      }
    })();
  const pageTitle = (() => {
    try {
      const match = new URL(pageUrl).pathname.match(/^\/game\/([^/]+)/i);
      return match
        ? decodeURIComponent(match[1])
            .replace(/\.[a-z0-9]{1,5}$/i, "")
            .replace(/[-_]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 200)
            .replace(/\b[a-z]/g, letter => letter.toUpperCase())
        : "";
    } catch {
      return "";
    }
  })();
  return {
    url: payload.url,
    filename:
      typeof payload.filename === "string" ? payload.filename.split(/[\\/]/).pop() : "",
    title:
      (typeof payload.title === "string" ? payload.title.trim().slice(0, 200) : "") ||
      pageTitle,
    pageUrl,
  };
}
