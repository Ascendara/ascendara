const ORIGIN = "https://downloads.khinsider.com";

function getKhinsiderUrl(path) {
  if (typeof path !== "string" || path.length > 4096)
    throw new Error("Invalid soundtrack path");
  const url = new URL(path, ORIGIN);
  if (
    url.origin !== ORIGIN ||
    url.username ||
    url.password ||
    !(url.pathname === "/search" || url.pathname.startsWith("/game-soundtracks/album/"))
  ) {
    throw new Error("Invalid soundtrack path");
  }
  return url.href;
}

async function requestKhinsider(path, browserSession) {
  try {
    const response = await browserSession.fetch(getKhinsiderUrl(path), {
      headers: { Accept: "text/html" },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { success: false, status: response.status };
    }
    return { success: true, data: await response.text() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { getKhinsiderUrl, requestKhinsider };
