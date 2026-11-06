// The torrent records each service keeps in localStorage: the game's data plus the
// handoff's progress flags, keyed "torrent:<id>".
export function readRecords(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    return {};
  }
}

export function updateRecord(provider, id, fields) {
  const records = readRecords(provider.metadataStorageKey);
  if (!records[id]) return;
  records[id] = { ...records[id], ...fields };
  localStorage.setItem(provider.metadataStorageKey, JSON.stringify(records));
}

// Torrents not yet on this PC. Only ones added since auto-handoff existed: older records
// were handled by hand.
export const isPendingTorrent = (id, entry) =>
  id.startsWith("torrent:") &&
  entry?.autoHandoff === true &&
  !entry.localDownloadStarted &&
  !entry.cloudTorrentMissing &&
  !entry.cloudTorrentRemoved;

export const pendingTorrents = provider =>
  Object.entries(readRecords(provider.metadataStorageKey))
    .filter(([id, entry]) => isPendingTorrent(id, entry))
    .map(([id, entry]) => ({ recordKey: id, id: id.slice(8), entry }));

// Deletes a waiting torrent from the service and stops its handoff. Returns false, and
// deletes nothing, when it already started downloading to this PC (a list on screen can
// be older than that).
export async function removePendingTorrent(provider, apiKey, recordKey) {
  if (readRecords(provider.metadataStorageKey)[recordKey]?.localDownloadStarted)
    return false;
  await provider.removeTorrent(apiKey, recordKey.slice(8));
  updateRecord(provider, recordKey, { cloudTorrentRemoved: true });
  return true;
}
