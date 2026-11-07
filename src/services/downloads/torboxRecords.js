// TorBox numbers torrents and web downloads separately, so one id can name both.
// Records are keyed "torrent:<id>" / "webdl:<id>"; bare ids only ever held web downloads.
export const getDownloadKey = download =>
  download?._storageKey ||
  `${download?._torboxType === "torrent" ? "torrent" : "webdl"}:${download?.id}`;

const isTorrent = download =>
  download?._torboxType === "torrent" ||
  String(download?._storageKey || "").startsWith("torrent:");

export const getStoredDownloadData = (storedDownloads, download) =>
  storedDownloads[getDownloadKey(download)] ||
  (!isTorrent(download) && storedDownloads[download?.id]) ||
  storedDownloads[download?.url] ||
  storedDownloads[download?.original_url] ||
  null;

export const isSentToPc = (downloadedToPc, storedDownloads, download) =>
  Boolean(
    downloadedToPc[getDownloadKey(download)] ||
    (!isTorrent(download) && downloadedToPc[download?.id]) ||
    getStoredDownloadData(storedDownloads, download)?.localDownloadStarted
  );
