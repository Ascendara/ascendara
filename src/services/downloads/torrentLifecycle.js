import { isTorrentLink } from "./torrentLink";

export function createLocalTorrentQueueData({
  torrentLink,
  gameName,
  gameData,
  dir,
}) {
  if (!isTorrentLink(torrentLink)) {
    throw new Error("A local torrent queue item requires a magnet or .torrent URL.");
  }

  return {
    url: torrentLink,
    gameName,
    online: gameData?.online || false,
    dlc: gameData?.dlc || false,
    isVr: gameData?.category?.includes("Virtual Reality") || false,
    updateFlow: gameData?.isUpdating || false,
    version: gameData?.version || "",
    imgID: gameData?.imgID,
    size: gameData?.size || "",
    additionalDirIndex: dir ?? 0,
    gameID: gameData?.gameID || "",
    directUrl: torrentLink,
    browserDirect: false,
    debridProviderId: null,
    debridLink: null,
    browserAssetGameId: gameData?.browserAssetGameId,
    browserAssetLogoId: gameData?.browserAssetLogoId,
    dir,
  };
}
